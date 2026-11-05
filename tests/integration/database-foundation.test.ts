import { randomUUID } from "node:crypto";

import { and, asc, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { getDatabase } from "@/db/client";
import * as schema from "@/db/schema";
import {
  auditLogs,
  brands,
  categories,
  inventoryItems,
  inventoryMovements,
  outboxEvents,
  permissions,
  productCategories,
  productImages,
  productVariants,
  products,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { seedAuthorizationReferenceData } from "@/db/seed-reference-data";
import { AuthorizationDeniedError, type StaffPrincipal } from "@/modules/auth";
import { provisionInitialOwner } from "@/modules/auth/server/owner-provisioning";
import { assignRole } from "@/modules/auth/server/role-service";
import { CatalogAuthorizationError, InventoryAdjustmentError } from "@/modules/catalog";
import { catalogCsvHeaders, serializeCsv } from "@/modules/catalog/domain/catalog-csv";
import { importCatalogCsv } from "@/modules/catalog/server/catalog-import-service";
import {
  createBrand,
  createCategory,
  setCategoryArchived,
} from "@/modules/catalog/server/catalog-organization-service";
import {
  adjustInventory,
  createCompleteProduct,
  updateProductVariant,
  updateProductOrganization,
} from "@/modules/catalog/server/catalog-service";
import {
  deleteProductImage,
  reorderProductImage,
  setPrimaryProductImage,
  type ProductImageStorage,
  uploadProductImage,
} from "@/modules/catalog/server/product-image-service";
import { claimOutboxEvents, markOutboxEventProcessed, runOutboxWorker } from "@/modules/jobs";
import {
  getStorefrontProduct,
  listStorefrontProducts,
} from "@/modules/storefront/server/storefront-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(testDatabaseUrl === undefined)("phase 1 database foundation", () => {
  let pool: Pool;
  let database: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl ?? "").pathname.slice(1);
    if (!databaseName.endsWith("_test")) {
      throw new Error("TEST_DATABASE_URL must reference a database whose name ends in _test.");
    }
    pool = new Pool({ connectionString: testDatabaseUrl });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: "src/db/migrations" });
    await pool.query(`
      TRUNCATE TABLE
        audit_logs,
        outbox_events,
        inventory_movements,
        inventory_items,
        product_images,
        variant_option_values,
        product_options,
        product_variants,
        product_categories,
        products,
        categories,
        brands,
        role_permissions,
        user_roles,
        permissions,
        roles,
        profiles,
        users
      CASCADE
    `);
    await seedAuthorizationReferenceData(database);
    await seedAuthorizationReferenceData(database);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("seeds the authorization catalog idempotently", async () => {
    const [roleCount] = await database.select({ value: count() }).from(roles);
    const [permissionCount] = await database.select({ value: count() }).from(permissions);
    const [grantCount] = await database.select({ value: count() }).from(rolePermissions);

    expect(roleCount?.value).toBe(7);
    expect(permissionCount?.value).toBe(10);
    expect(grantCount?.value).toBe(35);
  });

  it("enforces append-only audit history", async () => {
    const [auditLog] = await database
      .insert(auditLogs)
      .values({
        action: "phase1.integration_test",
        correlationId: randomUUID(),
        outcome: "success",
        resourceType: "database",
      })
      .returning({ id: auditLogs.id });

    expect(auditLog).toBeDefined();
    await expect(
      database
        .update(auditLogs)
        .set({ reason: "mutation must fail" })
        .where(eq(auditLogs.id, auditLog?.id ?? "")),
    ).rejects.toMatchObject({ cause: { code: "55000" } });
  });

  it("rejects processing events without an atomic worker lease", async () => {
    await expect(
      database.insert(outboxEvents).values({
        aggregateId: "missing-lease",
        aggregateType: "test",
        idempotencyKey: `phase1-invalid-${randomUUID()}`,
        payload: {},
        status: "processing",
        topic: "phase1.test",
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("lets overlapping workers claim different events", async () => {
    await database.insert(outboxEvents).values([
      {
        aggregateId: "one",
        aggregateType: "claim-test",
        idempotencyKey: `phase1-claim-${randomUUID()}`,
        payload: {},
        topic: "phase1.claim",
      },
      {
        aggregateId: "two",
        aggregateType: "claim-test",
        idempotencyKey: `phase1-claim-${randomUUID()}`,
        payload: {},
        topic: "phase1.claim",
      },
    ]);

    const [firstClaim, secondClaim] = await Promise.all([
      claimOutboxEvents("worker-one", 1, database),
      claimOutboxEvents("worker-two", 1, database),
    ]);

    expect(firstClaim).toHaveLength(1);
    expect(secondClaim).toHaveLength(1);
    expect(firstClaim[0]?.id).not.toBe(secondClaim[0]?.id);
    expect(
      await markOutboxEventProcessed(firstClaim[0]?.id ?? "", "worker-one", new Date(), database),
    ).toBe(true);
    expect(
      await markOutboxEventProcessed(secondClaim[0]?.id ?? "", "worker-one", new Date(), database),
    ).toBe(false);
    expect(
      await markOutboxEventProcessed(secondClaim[0]?.id ?? "", "worker-two", new Date(), database),
    ).toBe(true);
  });

  it("provisions the first owner only after provider identity verification", async () => {
    const identityId = randomUUID();
    const correlationId = randomUUID();

    await provisionInitialOwner(
      { correlationId, identityId, reason: "Initial controlled owner bootstrap" },
      { database, verifyIdentity: async () => true },
    );

    const [grant] = await database
      .select({ roleKey: roles.key })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.identityId, identityId), eq(users.identityProvider, "supabase")));
    const [audit] = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(eq(auditLogs.correlationId, correlationId));

    expect(grant?.roleKey).toBe("owner");
    expect(audit?.outcome).toBe("success");
  });

  it("audits allowed and denied role assignments", async () => {
    const [actor, target] = await database
      .insert(users)
      .values([
        { accountType: "staff", identityId: randomUUID() },
        { accountType: "staff", identityId: randomUUID() },
      ])
      .returning({ id: users.id });

    expect(actor).toBeDefined();
    expect(target).toBeDefined();

    const actorPrincipal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["staff.manage"]),
      status: "active",
      userId: actor?.id ?? "",
    };

    await assignRole(
      {
        actor: actorPrincipal,
        correlationId: randomUUID(),
        reason: "Assign order operations responsibility",
        roleKey: "order_manager",
        targetUserId: target?.id ?? "",
      },
      database,
    );
    await expect(
      assignRole(
        {
          actor: { ...actorPrincipal, permissionKeys: new Set() },
          correlationId: randomUUID(),
          reason: "Attempt without an explicit grant",
          roleKey: "administrator",
          targetUserId: target?.id ?? "",
        },
        database,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    const outcomes = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(
        and(eq(auditLogs.action, "staff.role.assign"), eq(auditLogs.resourceId, target?.id ?? "")),
      );

    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["denied", "success"]);
  });

  it("processes supported outbox events and safely retries failures", async () => {
    const failureKey = `phase1-worker-${randomUUID()}`;

    await database.insert(outboxEvents).values([
      {
        aggregateId: "success",
        aggregateType: "worker-test",
        idempotencyKey: `phase1-worker-${randomUUID()}`,
        payload: {},
        topic: "phase1.success",
      },
      {
        aggregateId: "failure",
        aggregateType: "worker-test",
        idempotencyKey: failureKey,
        payload: {},
        topic: "phase1.failure",
      },
    ]);

    const result = await runOutboxWorker({
      batchSize: 10,
      database,
      handlers: {
        "phase1.failure": async () => {
          throw new Error("provider detail must not be persisted");
        },
        "phase1.success": async () => undefined,
      },
      now: new Date(Date.now() + 60_000),
      workerId: "integration-worker",
    });

    const [failedEvent] = await database
      .select({
        idempotencyKey: outboxEvents.idempotencyKey,
        lastErrorCode: outboxEvents.lastErrorCode,
        status: outboxEvents.status,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.idempotencyKey, failureKey));

    expect(result.processed).toBe(1);
    expect(result.retried).toBe(1);
    expect(failedEvent).toEqual({
      idempotencyKey: failureKey,
      lastErrorCode: "handler_failed",
      status: "pending",
    });
  });

  it("creates a complete variant product and immutable initial stock movement", async () => {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    expect(actor).toBeDefined();

    const principal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["catalog.manage", "inventory.adjust"]),
      status: "active",
      userId: actor?.id ?? "",
    };
    const correlationId = randomUUID();
    const created = await createCompleteProduct(
      {
        actor: principal,
        basePriceMinor: 12_500,
        brand: { name: "Phase Two Brand", slug: `phase-two-brand-${randomUUID()}` },
        categories: [{ name: "Integration Category", slug: `category-${randomUUID()}` }],
        correlationId,
        currencyCode: "PKR",
        description: "Integration product",
        initialQuantity: 8,
        inventoryReason: "Initial integration stock",
        lowStockThreshold: 2,
        name: "Integration Variant Product",
        optionValues: [{ name: "Color", value: "Green" }],
        slug: `integration-product-${randomUUID()}`,
        status: "active",
        variant: {
          isActive: true,
          sku: `phase2-${randomUUID()}`,
          stockBehavior: "tracked",
          title: "Green",
        },
      },
      database,
    );

    const [item] = await database
      .select({ onHandQuantity: inventoryItems.onHandQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, created.inventoryItemId));
    const [movement] = await database
      .select({ delta: inventoryMovements.quantityDelta })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.inventoryItemId, created.inventoryItemId));
    const [audit] = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(eq(auditLogs.correlationId, correlationId));

    expect(item?.onHandQuantity).toBe(8);
    expect(movement?.delta).toBe(8);
    expect(audit?.outcome).toBe("success");

    const updateCorrelationId = randomUUID();
    await updateProductVariant(
      {
        actor: principal,
        correlationId: updateCorrelationId,
        heightMillimeters: 40,
        isActive: false,
        lengthMillimeters: 100,
        lowStockThreshold: 4,
        priceOverrideMinor: 13_000,
        productId: created.productId,
        reason: "Update the verified variant specification",
        sku: `phase2-updated-${randomUUID()}`,
        stockBehavior: "tracked",
        title: "Updated green",
        variantId: created.variantId,
        version: 1,
        weightGrams: 250,
        widthMillimeters: 60,
      },
      database,
    );
    const [updatedVariant] = await database
      .select({
        isActive: productVariants.isActive,
        lowStockThreshold: inventoryItems.lowStockThreshold,
        priceOverrideMinor: productVariants.priceOverrideMinor,
        title: productVariants.title,
        version: productVariants.version,
      })
      .from(productVariants)
      .innerJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
      .where(eq(productVariants.id, created.variantId));
    const [updateAudit] = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(eq(auditLogs.correlationId, updateCorrelationId));
    expect(updatedVariant).toEqual({
      isActive: false,
      lowStockThreshold: 4,
      priceOverrideMinor: 13_000,
      title: "Updated green",
      version: 2,
    });
    expect(updateAudit?.outcome).toBe("success");

    await expect(
      database
        .update(inventoryMovements)
        .set({ reason: "history must remain immutable" })
        .where(eq(inventoryMovements.inventoryItemId, created.inventoryItemId)),
    ).rejects.toMatchObject({ cause: { code: "55000" } });
  });

  it("default-denies catalog creation and audits the denied attempt", async () => {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    const correlationId = randomUUID();
    const slug = `denied-product-${randomUUID()}`;

    await expect(
      createCompleteProduct(
        {
          actor: {
            accountType: "staff",
            permissionKeys: new Set(),
            status: "active",
            userId: actor?.id ?? "",
          },
          basePriceMinor: 100,
          categories: [],
          correlationId,
          currencyCode: "PKR",
          initialQuantity: 0,
          inventoryReason: "Denied creation attempt",
          lowStockThreshold: 0,
          name: "Denied product",
          optionValues: [],
          slug,
          status: "draft",
          variant: {
            isActive: true,
            sku: `denied-${randomUUID()}`,
            stockBehavior: "tracked",
            title: "Default",
          },
        },
        database,
      ),
    ).rejects.toBeInstanceOf(CatalogAuthorizationError);

    const [product] = await database
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug));
    const [audit] = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(eq(auditLogs.correlationId, correlationId));
    expect(product).toBeUndefined();
    expect(audit?.outcome).toBe("denied");
  });

  it("adjusts stock atomically and rejects negative inventory with an audit record", async () => {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    const principal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["catalog.manage", "inventory.adjust"]),
      status: "active",
      userId: actor?.id ?? "",
    };
    const created = await createCompleteProduct(
      {
        actor: principal,
        basePriceMinor: 500,
        categories: [],
        correlationId: randomUUID(),
        currencyCode: "PKR",
        initialQuantity: 3,
        inventoryReason: "Initial adjustment test stock",
        lowStockThreshold: 1,
        name: "Adjustment product",
        optionValues: [],
        slug: `adjustment-product-${randomUUID()}`,
        status: "draft",
        variant: {
          isActive: true,
          sku: `adjust-${randomUUID()}`,
          stockBehavior: "tracked",
          title: "Default",
        },
      },
      database,
    );

    await expect(
      adjustInventory(
        {
          actor: principal,
          correlationId: randomUUID(),
          delta: -4,
          inventoryItemId: created.inventoryItemId,
          reason: "Invalid negative adjustment",
        },
        database,
      ),
    ).rejects.toBeInstanceOf(InventoryAdjustmentError);
    const adjusted = await adjustInventory(
      {
        actor: principal,
        correlationId: randomUUID(),
        delta: 2,
        inventoryItemId: created.inventoryItemId,
        reason: "Counted two additional units",
      },
      database,
    );

    expect(adjusted.onHandQuantity).toBe(5);
    const failures = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "inventory.adjust"),
          eq(auditLogs.resourceId, created.inventoryItemId),
          eq(auditLogs.outcome, "failure"),
        ),
      );
    expect(failures).toHaveLength(1);
  });

  it("rolls back the entire CSV import when a later row conflicts", async () => {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    const principal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["catalog.manage", "inventory.adjust"]),
      status: "active",
      userId: actor?.id ?? "",
    };
    const conflictingSku = `CSV-CONFLICT-${randomUUID()}`;
    await createCompleteProduct(
      {
        actor: principal,
        basePriceMinor: 100,
        categories: [],
        correlationId: randomUUID(),
        currencyCode: "PKR",
        initialQuantity: 0,
        inventoryReason: "Existing catalog row",
        lowStockThreshold: 0,
        name: "Existing CSV conflict",
        optionValues: [],
        slug: `existing-csv-${randomUUID()}`,
        status: "draft",
        variant: {
          isActive: true,
          sku: conflictingSku,
          stockBehavior: "tracked",
          title: "Default",
        },
      },
      database,
    );

    const firstSlug = `csv-rollback-${randomUUID()}`;
    const row = (name: string, slug: string, sku: string) =>
      [
        name,
        slug,
        "",
        "draft",
        "PKR",
        100,
        "",
        "",
        "",
        "",
        "Default",
        sku,
        null,
        "tracked",
        0,
        0,
        "",
        "",
        "Validated CSV stock",
      ] as const;
    const csvText = serializeCsv([
      catalogCsvHeaders,
      row("First valid row", firstSlug, `CSV-VALID-${randomUUID()}`),
      row("Conflicting row", `csv-conflict-${randomUUID()}`, conflictingSku),
    ]);

    await expect(
      importCatalogCsv({ actor: principal, correlationId: randomUUID(), csvText }, database),
    ).rejects.toBeInstanceOf(Error);

    const [rolledBackProduct] = await database
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, firstSlug));
    expect(rolledBackProduct).toBeUndefined();
  });

  it("manages audited brand and category hierarchy without deleting references", async () => {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    const principal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["catalog.manage"]),
      status: "active",
      userId: actor?.id ?? "",
    };
    const brandSlug = `brand-${randomUUID()}`;
    const brand = await createBrand(
      {
        actor: principal,
        correlationId: randomUUID(),
        name: "Hierarchy Brand",
        slug: brandSlug,
      },
      database,
    );
    const parent = await createCategory(
      {
        actor: principal,
        correlationId: randomUUID(),
        name: "Parent Category",
        position: 0,
        slug: `parent-${randomUUID()}`,
      },
      database,
    );
    const child = await createCategory(
      {
        actor: principal,
        correlationId: randomUUID(),
        name: "Child Category",
        parentId: parent.categoryId,
        position: 1,
        slug: `child-${randomUUID()}`,
      },
      database,
    );
    const archiveCorrelationId = randomUUID();
    await setCategoryArchived(
      {
        actor: principal,
        archived: true,
        correlationId: archiveCorrelationId,
        reason: "Category is temporarily unavailable",
        resourceId: child.categoryId,
      },
      database,
    );
    const product = await createCompleteProduct(
      {
        actor: principal,
        basePriceMinor: 100,
        categories: [],
        correlationId: randomUUID(),
        currencyCode: "PKR",
        initialQuantity: 0,
        inventoryReason: "No opening stock",
        lowStockThreshold: 0,
        name: "Organized product",
        optionValues: [],
        slug: `organized-${randomUUID()}`,
        status: "draft",
        variant: {
          isActive: true,
          sku: `organized-${randomUUID()}`,
          stockBehavior: "tracked",
          title: "Default",
        },
      },
      database,
    );
    await updateProductOrganization(
      {
        actor: principal,
        brandId: brand.brandId,
        categoryIds: [parent.categoryId],
        correlationId: randomUUID(),
        productId: product.productId,
        reason: "Assign approved catalog organization",
      },
      database,
    );

    const [storedBrand] = await database
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.id, brand.brandId));
    const [storedChild] = await database
      .select({ archivedAt: categories.archivedAt, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, child.categoryId));
    const [audit] = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(eq(auditLogs.correlationId, archiveCorrelationId));
    const [assignment] = await database
      .select({ brandId: products.brandId, categoryId: productCategories.categoryId })
      .from(products)
      .innerJoin(productCategories, eq(productCategories.productId, products.id))
      .where(eq(products.id, product.productId));

    expect(storedBrand?.id).toBe(brand.brandId);
    expect(storedChild?.parentId).toBe(parent.categoryId);
    expect(storedChild?.archivedAt).toBeInstanceOf(Date);
    expect(audit?.outcome).toBe("success");
    expect(assignment).toEqual({ brandId: brand.brandId, categoryId: parent.categoryId });
  });

  it("reorders product images and maintains exactly one primary image", async () => {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    const principal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["catalog.manage"]),
      status: "active",
      userId: actor?.id ?? "",
    };
    const created = await createCompleteProduct(
      {
        actor: principal,
        basePriceMinor: 100,
        categories: [],
        correlationId: randomUUID(),
        currencyCode: "PKR",
        initialQuantity: 0,
        inventoryReason: "No opening stock",
        lowStockThreshold: 0,
        name: "Image management product",
        optionValues: [],
        slug: `image-product-${randomUUID()}`,
        status: "draft",
        variant: {
          isActive: true,
          sku: `image-${randomUUID()}`,
          stockBehavior: "tracked",
          title: "Default",
        },
      },
      database,
    );
    const storedObjects = new Set<string>();
    const storage: ProductImageStorage = {
      download: async () => null,
      remove: async (storageKey) => storedObjects.delete(storageKey),
      upload: async ({ storageKey }) => {
        storedObjects.add(storageKey);
        return true;
      },
    };
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const first = await uploadProductImage(
      {
        actor: principal,
        altText: "First image",
        correlationId: randomUUID(),
        file: new File([pngBytes], "first.png", { type: "image/png" }),
        isPrimary: false,
        productId: created.productId,
      },
      database,
      storage,
    );
    const second = await uploadProductImage(
      {
        actor: principal,
        altText: "Second image",
        correlationId: randomUUID(),
        file: new File([pngBytes], "second.png", { type: "image/png" }),
        isPrimary: false,
        productId: created.productId,
      },
      database,
      storage,
    );

    const [automaticallyPrimary] = await database
      .select({ id: productImages.id, isPrimary: productImages.isPrimary })
      .from(productImages)
      .where(eq(productImages.id, first.imageId));
    expect(automaticallyPrimary?.isPrimary).toBe(true);

    await reorderProductImage(
      {
        actor: principal,
        correlationId: randomUUID(),
        direction: "up",
        imageId: second.imageId,
        productId: created.productId,
        reason: "Feature image should appear first",
      },
      database,
    );
    await setPrimaryProductImage(
      {
        actor: principal,
        correlationId: randomUUID(),
        imageId: second.imageId,
        productId: created.productId,
        reason: "Selected as the primary catalog image",
      },
      database,
    );

    const stored = await database
      .select({ id: productImages.id, isPrimary: productImages.isPrimary })
      .from(productImages)
      .where(eq(productImages.productId, created.productId))
      .orderBy(asc(productImages.position));
    expect(stored.map(({ id }) => id)).toEqual([second.imageId, first.imageId]);
    expect(stored.filter(({ isPrimary }) => isPrimary).map(({ id }) => id)).toEqual([
      second.imageId,
    ]);

    await deleteProductImage(
      {
        actor: principal,
        correlationId: randomUUID(),
        imageId: second.imageId,
        productId: created.productId,
        reason: "Remove the superseded primary image",
      },
      database,
      storage,
    );
    const remaining = await database
      .select({ id: productImages.id, isPrimary: productImages.isPrimary })
      .from(productImages)
      .where(eq(productImages.productId, created.productId));
    expect(remaining).toEqual([{ id: first.imageId, isPrimary: true }]);
    expect(storedObjects.size).toBe(1);
  });

  it("publishes only active catalog products through searchable storefront queries", async () => {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    const principal: StaffPrincipal = {
      accountType: "staff",
      permissionKeys: new Set(["catalog.manage", "inventory.adjust"]),
      status: "active",
      userId: actor?.id ?? "",
    };
    const token = randomUUID();
    const activeSlug = `storefront-active-${token}`;
    await createCompleteProduct(
      {
        actor: principal,
        basePriceMinor: 25_000,
        categories: [{ name: `Storefront category ${token}`, slug: `storefront-${token}` }],
        correlationId: randomUUID(),
        currencyCode: "PKR",
        description: `Searchable storefront product ${token}`,
        initialQuantity: 4,
        inventoryReason: "Verified storefront opening stock",
        lowStockThreshold: 1,
        name: `Published storefront product ${token}`,
        optionValues: [],
        slug: activeSlug,
        status: "active",
        variant: {
          isActive: true,
          sku: `STORE-${token}`,
          stockBehavior: "tracked",
          title: "Default",
        },
      },
      database,
    );
    await createCompleteProduct(
      {
        actor: principal,
        basePriceMinor: 10_000,
        categories: [],
        correlationId: randomUUID(),
        currencyCode: "PKR",
        description: `Searchable storefront product ${token}`,
        initialQuantity: 2,
        inventoryReason: "Draft product stock",
        lowStockThreshold: 0,
        name: `Draft storefront product ${token}`,
        optionValues: [],
        slug: `storefront-draft-${token}`,
        status: "draft",
        variant: {
          isActive: true,
          sku: `DRAFT-${token}`,
          stockBehavior: "tracked",
          title: "Default",
        },
      },
      database,
    );

    const page = await listStorefrontProducts(
      { availability: "in_stock", page: 1, query: token, sort: "price_asc" },
      database,
    );
    const detail = await getStorefrontProduct(activeSlug, database);

    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ available: true, slug: activeSlug });
    expect(detail).toMatchObject({ slug: activeSlug });
    expect(await getStorefrontProduct(`storefront-draft-${token}`, database)).toBeNull();
  });
});
