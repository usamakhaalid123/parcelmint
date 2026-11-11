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
  cartItems,
  carts,
  categories,
  customerProfiles,
  coupons,
  deliveryZones,
  fulfillments,
  inventoryItems,
  inventoryMovements,
  inventoryReservations,
  notificationAttempts,
  notifications,
  orderOperationEvents,
  orderRiskFlags,
  orderItems,
  orders,
  otpChallenges,
  outboxEvents,
  permissions,
  productCategories,
  productImages,
  productVariants,
  products,
  rolePermissions,
  refundRecords,
  returnItems,
  roles,
  shippingRates,
  shipmentEvents,
  shipments,
  trackingChallenges,
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
import {
  addCartItem,
  applyCartCoupon,
  createCart,
  mergeCarts,
} from "@/modules/checkout/server/cart-repository";
import { createOrderFromCart } from "@/modules/checkout/server/checkout-service";
import { releaseExpiredReservations } from "@/modules/checkout/server/reservation-expiry-service";
import { CheckoutError } from "@/modules/checkout";
import type { CheckoutInput } from "@/modules/checkout";
import { OrderAuthorizationError, OrderTransitionError } from "@/modules/orders";
import {
  cancelOrder,
  confirmOrderManually,
  createShipmentLabel,
  applyCourierEvent,
  handoffOrder,
  transitionFulfillment,
  transitionShipment,
} from "@/modules/orders/server/order-service";
import { issueOrderOtp, verifyOrderOtp } from "@/modules/orders/server/otp-service";
import {
  createCustomerTrackingSession,
  getTrackedOrder,
  issueTrackingChallenge,
  verifyTrackingChallenge,
} from "@/modules/orders/server/tracking-service";
import { createNotificationOutboxHandlers } from "@/modules/orders/server/notification-service";
import { createOperationalBlock } from "@/modules/orders/server/blocklist-service";
import {
  deleteCustomerAddress,
  getCustomerAccount,
  saveCustomerAddress,
} from "@/modules/orders/server/customer-account-service";
import {
  cancelTrackedOrder,
  recordOfflineRefund,
  requestTrackedReturn,
  transitionReturn,
} from "@/modules/orders/server/return-service";

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
        rate_limit_events,
        idempotency_keys,
        coupon_redemptions,
        inventory_reservations,
        order_addresses,
        order_items,
        orders,
        shipping_rates,
        delivery_zones,
        cart_items,
        carts,
        coupons,
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

  async function seedCheckoutProduct(initialQuantity: number) {
    const token = randomUUID();
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    const created = await createCompleteProduct(
      {
        actor: {
          accountType: "staff",
          permissionKeys: new Set(["catalog.manage", "inventory.adjust"]),
          status: "active",
          userId: actor?.id ?? "",
        },
        basePriceMinor: 10_000,
        categories: [],
        correlationId: randomUUID(),
        currencyCode: "PKR",
        description: "Checkout integration product",
        initialQuantity,
        inventoryReason: "Checkout integration stock",
        lowStockThreshold: 0,
        name: `Checkout product ${token}`,
        optionValues: [],
        slug: `checkout-${token}`,
        status: "active",
        variant: {
          isActive: true,
          sku: `CHECKOUT-${token}`,
          stockBehavior: "tracked",
          title: "Default",
        },
      },
      database,
    );
    const [variant] = await database
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, created.productId));
    if (variant === undefined) throw new Error("Checkout seed did not create a variant");
    return { productId: created.productId, variantId: variant.id };
  }

  async function seedDeliveryZone() {
    const [zone] = await database
      .insert(deliveryZones)
      .values({ code: `ZONE_${randomUUID().replaceAll("-", "").toUpperCase()}`, name: "Test area" })
      .returning({ id: deliveryZones.id });
    if (zone === undefined) throw new Error("Delivery zone creation failed");
    await database.insert(shippingRates).values({
      currencyCode: "PKR",
      deliveryZoneId: zone.id,
      estimatedDaysMax: 3,
      estimatedDaysMin: 1,
      feeMinor: 500,
      name: "Standard delivery",
    });
    return zone.id;
  }

  async function seedOrderPrincipal(
    permissionKeys: readonly string[] = ["orders.manage"],
  ): Promise<StaffPrincipal> {
    const [actor] = await database
      .insert(users)
      .values({ accountType: "staff", identityId: randomUUID() })
      .returning({ id: users.id });
    if (actor === undefined) throw new Error("Order actor creation failed");
    return {
      accountType: "staff",
      permissionKeys: new Set(permissionKeys),
      status: "active",
      userId: actor.id,
    };
  }

  async function seedSubmittedOrder(
    initialQuantity = 3,
    mobileNumber = "+923006666666",
    purchaseQuantity = 1,
  ) {
    const product = await seedCheckoutProduct(initialQuantity);
    const deliveryZoneId = await seedDeliveryZone();
    const cart = await createCart(`phase5-${randomUUID()}`, database);
    await addCartItem(cart.id, product.variantId, purchaseQuantity, database);
    const order = await createOrderFromCart(
      cart.id,
      {
        addressLine: "45 Phase Five Operations Road",
        customerName: "Phase Five Buyer",
        deliveryInstructions: null,
        deliveryZoneId,
        email: null,
        idempotencyKey: randomUUID(),
        landmark: null,
        mobileNumber,
        policyConsent: "on",
        postalCode: null,
      },
      database,
    );
    return { order, product };
  }

  async function deliverOrder(orderId: string, principal: StaffPrincipal) {
    await confirmOrderManually(
      { actor: principal, correlationId: randomUUID(), orderId, reason: "Confirmed for delivery" },
      database,
    );
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "processing",
        orderId,
        reason: "Started processing",
      },
      database,
    );
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "packed",
        orderId,
        reason: "Packed order",
      },
      database,
    );
    await createShipmentLabel(
      {
        actor: principal,
        correlationId: randomUUID(),
        courierCode: "RETURN_TEST",
        orderId,
        reason: "Created label",
        trackingNumber: `RET-${randomUUID()}`,
      },
      database,
    );
    await handoffOrder(
      { actor: principal, correlationId: randomUUID(), orderId, reason: "Handed to courier" },
      database,
    );
    for (const nextState of ["in_transit", "out_for_delivery", "delivered"] as const) {
      await transitionShipment(
        {
          actor: principal,
          correlationId: randomUUID(),
          nextState,
          orderId,
          reason: `Moved to ${nextState}`,
        },
        database,
      );
    }
  }

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

  it("creates one idempotent order and snapshots the latest server price", async () => {
    const product = await seedCheckoutProduct(3);
    const deliveryZoneId = await seedDeliveryZone();
    const cart = await createCart(`checkout-token-${randomUUID()}`, database);
    await addCartItem(cart.id, product.variantId, 1, database);
    await database
      .update(products)
      .set({ basePriceMinor: 12_500 })
      .where(eq(products.id, product.productId));
    const input: CheckoutInput = {
      addressLine: "12 Integration Test Street",
      customerName: "Integration Buyer",
      deliveryInstructions: null,
      deliveryZoneId,
      email: null,
      idempotencyKey: randomUUID(),
      landmark: null,
      mobileNumber: "+923001234567",
      policyConsent: "on",
      postalCode: null,
    };

    const [first, repeated] = await Promise.all([
      createOrderFromCart(cart.id, input, database),
      createOrderFromCart(cart.id, input, database),
    ]);
    const [orderCount] = await database.select({ value: count() }).from(orders);
    const [snapshot] = await database
      .select({ unitPriceMinor: orderItems.unitPriceMinor })
      .from(orderItems)
      .where(eq(orderItems.orderId, first.orderId));

    expect(repeated.orderId).toBe(first.orderId);
    expect(first.grandTotalMinor).toBe(13_000);
    expect(snapshot?.unitPriceMinor).toBe(12_500);
    expect(orderCount?.value).toBe(1);
    await expect(
      createOrderFromCart(cart.id, { ...input, addressLine: "99 Changed Address" }, database),
    ).rejects.toEqual(new CheckoutError("idempotency_conflict"));
    await expect(
      database
        .update(orderItems)
        .set({ productName: "Mutated history" })
        .where(eq(orderItems.orderId, first.orderId)),
    ).rejects.toMatchObject({ cause: { code: "55000" } });
  });

  it("serializes concurrent last-item checkout without overselling", async () => {
    const product = await seedCheckoutProduct(1);
    const deliveryZoneId = await seedDeliveryZone();
    const firstCart = await createCart(`last-item-a-${randomUUID()}`, database);
    const secondCart = await createCart(`last-item-b-${randomUUID()}`, database);
    await Promise.all([
      addCartItem(firstCart.id, product.variantId, 1, database),
      addCartItem(secondCart.id, product.variantId, 1, database),
    ]);
    const baseInput: Omit<CheckoutInput, "idempotencyKey"> = {
      addressLine: "34 Concurrency Road",
      customerName: "Concurrent Buyer",
      deliveryInstructions: null,
      deliveryZoneId,
      email: null,
      landmark: null,
      mobileNumber: "+923009876543",
      policyConsent: "on",
      postalCode: null,
    };

    const results = await Promise.allSettled([
      createOrderFromCart(firstCart.id, { ...baseInput, idempotencyKey: randomUUID() }, database),
      createOrderFromCart(secondCart.id, { ...baseInput, idempotencyKey: randomUUID() }, database),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    const [inventory] = await database
      .select({ onHand: inventoryItems.onHandQuantity, reserved: inventoryItems.reservedQuantity })
      .from(inventoryItems)
      .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .where(eq(productVariants.id, product.variantId));

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: { code: "stock_unavailable" } });
    expect(inventory).toEqual({ onHand: 1, reserved: 1 });
  });

  it("rejects a product that becomes unavailable before checkout", async () => {
    const product = await seedCheckoutProduct(2);
    const deliveryZoneId = await seedDeliveryZone();
    const cart = await createCart(`unavailable-${randomUUID()}`, database);
    await addCartItem(cart.id, product.variantId, 1, database);
    await database
      .update(products)
      .set({ status: "archived" })
      .where(eq(products.id, product.productId));

    await expect(
      createOrderFromCart(
        cart.id,
        {
          addressLine: "91 Unavailable Product Road",
          customerName: "Availability Buyer",
          deliveryInstructions: null,
          deliveryZoneId,
          email: null,
          idempotencyKey: randomUUID(),
          landmark: null,
          mobileNumber: "+923004444444",
          policyConsent: "on",
          postalCode: null,
        },
        database,
      ),
    ).rejects.toEqual(new CheckoutError("cart_unavailable"));
  });

  it("rejects an unsupported delivery area without creating an order", async () => {
    const product = await seedCheckoutProduct(2);
    const cart = await createCart(`unsupported-zone-${randomUUID()}`, database);
    await addCartItem(cart.id, product.variantId, 1, database);
    const [ordersBefore] = await database.select({ value: count() }).from(orders);

    await expect(
      createOrderFromCart(
        cart.id,
        {
          addressLine: "23 Unsupported Delivery Street",
          customerName: "Delivery Buyer",
          deliveryInstructions: null,
          deliveryZoneId: randomUUID(),
          email: null,
          idempotencyKey: randomUUID(),
          landmark: null,
          mobileNumber: "+923005555555",
          policyConsent: "on",
          postalCode: null,
        },
        database,
      ),
    ).rejects.toEqual(new CheckoutError("delivery_unsupported"));

    const [ordersAfter] = await database.select({ value: count() }).from(orders);
    expect(ordersAfter?.value).toBe(ordersBefore?.value);
  });

  it("rechecks coupon usage limits inside checkout", async () => {
    const product = await seedCheckoutProduct(3);
    const deliveryZoneId = await seedDeliveryZone();
    await database.insert(coupons).values({
      code: "LIMIT-ONE",
      currencyCode: "PKR",
      discountType: "fixed",
      discountValue: 1_000,
      normalizedCode: "LIMIT-ONE",
      usageLimit: 1,
    });
    const firstCart = await createCart(`coupon-a-${randomUUID()}`, database);
    const secondCart = await createCart(`coupon-b-${randomUUID()}`, database);
    await Promise.all([
      addCartItem(firstCart.id, product.variantId, 1, database),
      addCartItem(secondCart.id, product.variantId, 1, database),
    ]);
    await Promise.all([
      applyCartCoupon(firstCart.id, "limit-one", new Date(), database),
      applyCartCoupon(secondCart.id, "LIMIT-ONE", new Date(), database),
    ]);
    const common: Omit<CheckoutInput, "idempotencyKey" | "mobileNumber"> = {
      addressLine: "78 Coupon Avenue",
      customerName: "Coupon Buyer",
      deliveryInstructions: null,
      deliveryZoneId,
      email: null,
      landmark: null,
      policyConsent: "on",
      postalCode: null,
    };
    const first = await createOrderFromCart(
      firstCart.id,
      { ...common, idempotencyKey: randomUUID(), mobileNumber: "+923002222222" },
      database,
    );
    expect(first.grandTotalMinor).toBe(9_500);
    await expect(
      createOrderFromCart(
        secondCart.id,
        { ...common, idempotencyKey: randomUUID(), mobileNumber: "+923003333333" },
        database,
      ),
    ).rejects.toMatchObject({ code: "coupon_invalid" });
  });

  it("releases expired reservations once and expires pending verification", async () => {
    const product = await seedCheckoutProduct(2);
    const deliveryZoneId = await seedDeliveryZone();
    const cart = await createCart(`expiry-${randomUUID()}`, database);
    await addCartItem(cart.id, product.variantId, 1, database);
    const order = await createOrderFromCart(
      cart.id,
      {
        addressLine: "56 Expiry Lane",
        customerName: "Expiry Buyer",
        deliveryInstructions: null,
        deliveryZoneId,
        email: null,
        idempotencyKey: randomUUID(),
        landmark: null,
        mobileNumber: "+923001111111",
        policyConsent: "on",
        postalCode: null,
      },
      database,
    );
    const now = new Date();
    await database
      .update(inventoryReservations)
      .set({ expiresAt: new Date(now.getTime() - 1_000) })
      .where(eq(inventoryReservations.orderId, order.orderId));

    const overlappingResults = await Promise.all([
      releaseExpiredReservations(100, now, database),
      releaseExpiredReservations(100, now, database),
    ]);
    expect(overlappingResults.map(({ released }) => released).sort()).toEqual([0, 1]);
    expect(await releaseExpiredReservations(100, now, database)).toEqual({ released: 0 });
    const [inventory] = await database
      .select({ reserved: inventoryItems.reservedQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.variantId, product.variantId));
    const [expiredOrder] = await database
      .select({ verification: orders.verificationState })
      .from(orders)
      .where(eq(orders.id, order.orderId));
    expect(inventory?.reserved).toBe(0);
    expect(expiredOrder?.verification).toBe("expired");
  });

  it("merges anonymous cart quantities deterministically", async () => {
    const product = await seedCheckoutProduct(10);
    const source = await createCart(`merge-source-${randomUUID()}`, database);
    const target = await createCart(`merge-target-${randomUUID()}`, database);
    await addCartItem(source.id, product.variantId, 2, database);
    await addCartItem(target.id, product.variantId, 3, database);

    await mergeCarts(source.id, target.id, database);
    const [merged] = await database
      .select({ quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, target.id), eq(cartItems.variantId, product.variantId)));
    const [sourceCart] = await database
      .select({ status: carts.status })
      .from(carts)
      .where(eq(carts.id, source.id));
    expect(merged?.quantity).toBe(5);
    expect(sourceCart?.status).toBe("abandoned");
  });

  it("enforces and audits the complete verification-to-handoff workflow", async () => {
    const { order, product } = await seedSubmittedOrder();
    const principal = await seedOrderPrincipal();

    await confirmOrderManually(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Customer confirmed the COD order by phone",
      },
      database,
    );
    await expect(
      confirmOrderManually(
        {
          actor: principal,
          correlationId: randomUUID(),
          orderId: order.orderId,
          reason: "Invalid repeated confirmation",
        },
        database,
      ),
    ).rejects.toEqual(new OrderTransitionError("invalid_transition"));
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "processing",
        orderId: order.orderId,
        reason: "Warehouse started picking the order",
      },
      database,
    );
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "packed",
        orderId: order.orderId,
        reason: "Warehouse completed packing checks",
      },
      database,
    );
    await createShipmentLabel(
      {
        actor: principal,
        correlationId: randomUUID(),
        courierCode: "TEST_COURIER",
        orderId: order.orderId,
        reason: "Courier booking created",
        trackingNumber: `TRACK-${randomUUID()}`,
      },
      database,
    );
    await expect(
      transitionShipment(
        {
          actor: principal,
          correlationId: randomUUID(),
          nextState: "handed_to_courier",
          orderId: order.orderId,
          reason: "Attempt to bypass atomic courier handoff",
        },
        database,
      ),
    ).rejects.toThrow();
    await handoffOrder(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Sealed parcel handed to courier",
      },
      database,
    );

    const [state] = await database
      .select({
        fulfillment: fulfillments.status,
        orderFulfillment: orders.fulfillmentState,
        shipment: shipments.status,
      })
      .from(orders)
      .innerJoin(fulfillments, eq(fulfillments.orderId, orders.id))
      .innerJoin(shipments, eq(shipments.fulfillmentId, fulfillments.id))
      .where(eq(orders.id, order.orderId));
    const [inventory] = await database
      .select({ onHand: inventoryItems.onHandQuantity, reserved: inventoryItems.reservedQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.variantId, product.variantId));
    const events = await database
      .select({ id: orderOperationEvents.id })
      .from(orderOperationEvents)
      .where(eq(orderOperationEvents.orderId, order.orderId));

    expect(state).toEqual({
      fulfillment: "fulfilled",
      orderFulfillment: "fulfilled",
      shipment: "handed_to_courier",
    });
    expect(inventory).toEqual({ onHand: 2, reserved: 0 });
    expect(events.length).toBeGreaterThanOrEqual(5);
    await expect(
      database
        .update(orderOperationEvents)
        .set({ reason: "Mutated operational history" })
        .where(eq(orderOperationEvents.orderId, order.orderId)),
    ).rejects.toMatchObject({ cause: { code: "55000" } });
  });

  it("cancels shipment and releases stock before courier handoff", async () => {
    const { order, product } = await seedSubmittedOrder(2, "+923007171717");
    const principal = await seedOrderPrincipal();
    await confirmOrderManually(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Confirmed before pre-handoff cancellation test",
      },
      database,
    );
    await createShipmentLabel(
      {
        actor: principal,
        correlationId: randomUUID(),
        courierCode: "PRE_CANCEL",
        orderId: order.orderId,
        reason: "Created label before customer cancellation",
        trackingNumber: `PRE-CANCEL-${randomUUID()}`,
      },
      database,
    );
    await cancelOrder(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Customer cancelled before courier handoff",
      },
      database,
    );
    const [state] = await database
      .select({
        fulfillment: orders.fulfillmentState,
        lifecycle: orders.lifecycleState,
        shipment: shipments.status,
      })
      .from(orders)
      .innerJoin(fulfillments, eq(fulfillments.orderId, orders.id))
      .innerJoin(shipments, eq(shipments.fulfillmentId, fulfillments.id))
      .where(eq(orders.id, order.orderId));
    const [inventory] = await database
      .select({ onHand: inventoryItems.onHandQuantity, reserved: inventoryItems.reservedQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.variantId, product.variantId));
    expect(state).toEqual({
      fulfillment: "cancelled",
      lifecycle: "cancelled",
      shipment: "cancelled",
    });
    expect(inventory).toEqual({ onHand: 2, reserved: 0 });
  });

  it("requires elevated permission to cancel after stock finalization", async () => {
    const { order, product } = await seedSubmittedOrder(2, "+923007777777");
    const principal = await seedOrderPrincipal();
    await confirmOrderManually(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Customer confirmed before cancellation test",
      },
      database,
    );
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "processing",
        orderId: order.orderId,
        reason: "Started cancellation test processing",
      },
      database,
    );
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "packed",
        orderId: order.orderId,
        reason: "Packed cancellation test order",
      },
      database,
    );
    await createShipmentLabel(
      {
        actor: principal,
        correlationId: randomUUID(),
        courierCode: "CANCEL_TEST",
        orderId: order.orderId,
        reason: "Created cancellation test label",
        trackingNumber: `CANCEL-${randomUUID()}`,
      },
      database,
    );
    await handoffOrder(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Finalized stock before cancellation test",
      },
      database,
    );

    await expect(
      cancelOrder(
        {
          actor: principal,
          correlationId: randomUUID(),
          orderId: order.orderId,
          reason: "Attempt without elevated permission",
        },
        database,
      ),
    ).rejects.toBeInstanceOf(OrderAuthorizationError);
    const elevated = await seedOrderPrincipal(["orders.manage", "orders.cancel_after_shipment"]);
    await cancelOrder(
      {
        actor: elevated,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Courier reported an approved post-handoff cancellation",
      },
      database,
    );
    const [inventory] = await database
      .select({ onHand: inventoryItems.onHandQuantity, reserved: inventoryItems.reservedQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.variantId, product.variantId));
    const [cancelled] = await database
      .select({ lifecycle: orders.lifecycleState })
      .from(orders)
      .where(eq(orders.id, order.orderId));
    expect(cancelled?.lifecycle).toBe("cancelled");
    expect(inventory).toEqual({ onHand: 1, reserved: 0 });
  });

  it("rejects out-of-order courier events and ignores duplicate provider events", async () => {
    const { order } = await seedSubmittedOrder(2, "+923008888888");
    const principal = await seedOrderPrincipal();
    await confirmOrderManually(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Confirmed courier event test",
      },
      database,
    );
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "processing",
        orderId: order.orderId,
        reason: "Processing courier event test",
      },
      database,
    );
    await transitionFulfillment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState: "packed",
        orderId: order.orderId,
        reason: "Packed courier event test",
      },
      database,
    );
    await createShipmentLabel(
      {
        actor: principal,
        correlationId: randomUUID(),
        courierCode: "EVENT_TEST",
        orderId: order.orderId,
        reason: "Created courier event label",
        trackingNumber: `EVENT-${randomUUID()}`,
      },
      database,
    );
    await handoffOrder(
      {
        actor: principal,
        correlationId: randomUUID(),
        orderId: order.orderId,
        reason: "Courier accepted event test parcel",
      },
      database,
    );
    const providerEventId = `provider-${randomUUID()}`;
    const [shipment] = await database
      .select({ courierCode: shipments.courierCode, trackingNumber: shipments.trackingNumber })
      .from(shipments)
      .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
      .where(eq(fulfillments.orderId, order.orderId));
    if (
      shipment?.courierCode === null ||
      shipment?.trackingNumber === null ||
      shipment === undefined
    ) {
      throw new Error("Courier shipment was not configured");
    }
    await expect(
      applyCourierEvent(
        {
          courierCode: shipment.courierCode,
          nextState: "in_transit",
          providerEventId,
          reason: "Courier scanned parcel in transit",
          trackingNumber: shipment.trackingNumber,
        },
        database,
      ),
    ).resolves.toMatchObject({ duplicate: false, orderId: order.orderId });
    await expect(
      applyCourierEvent(
        {
          courierCode: shipment.courierCode,
          nextState: "in_transit",
          providerEventId,
          reason: "Duplicate courier delivery",
          trackingNumber: shipment.trackingNumber,
        },
        database,
      ),
    ).resolves.toMatchObject({ duplicate: true, orderId: order.orderId });
    await expect(
      transitionShipment(
        {
          actor: principal,
          correlationId: randomUUID(),
          nextState: "delivered",
          orderId: order.orderId,
          providerEventId: `provider-${randomUUID()}`,
          reason: "Invalid skipped delivery states",
        },
        database,
      ),
    ).rejects.toEqual(new OrderTransitionError("invalid_transition"));
    const events = await database
      .select({ id: shipmentEvents.id })
      .from(shipmentEvents)
      .where(eq(shipmentEvents.providerEventId, providerEventId));
    expect(events).toHaveLength(1);
  });

  it("stores OTP verifiers one-way and persists failed attempt limits", async () => {
    const { order } = await seedSubmittedOrder(2, "+923009999999");
    const principal = await seedOrderPrincipal();
    const issued = await issueOrderOtp(
      { actor: principal, correlationId: randomUUID(), orderId: order.orderId },
      database,
    );
    const [stored] = await database
      .select({ attempts: otpChallenges.attemptCount, verifier: otpChallenges.verifierHash })
      .from(otpChallenges)
      .where(eq(otpChallenges.id, issued.challengeId));
    expect(stored?.verifier).not.toContain(issued.code);
    const wrongCode = issued.code === "000001" ? "000002" : "000001";
    await expect(
      verifyOrderOtp(
        { challengeId: issued.challengeId, code: wrongCode, correlationId: randomUUID() },
        database,
      ),
    ).rejects.toEqual(new OrderTransitionError("invalid_transition"));
    const [afterFailure] = await database
      .select({ attempts: otpChallenges.attemptCount })
      .from(otpChallenges)
      .where(eq(otpChallenges.id, issued.challengeId));
    expect(afterFailure?.attempts).toBe(1);
    await expect(
      verifyOrderOtp(
        { challengeId: issued.challengeId, code: issued.code, correlationId: randomUUID() },
        database,
      ),
    ).resolves.toEqual({ orderId: order.orderId });
  });

  it("enforces audited blocklists and flags likely duplicates without auto-rejection", async () => {
    const blockPrincipal = await seedOrderPrincipal(["customers.blocklist"]);
    await createOperationalBlock(
      {
        actor: blockPrincipal,
        correlationId: randomUUID(),
        expiresAt: null,
        reason: "Confirmed operational abuse pattern",
        type: "mobile",
        value: "+923001212121",
      },
      database,
    );
    const product = await seedCheckoutProduct(4);
    const deliveryZoneId = await seedDeliveryZone();
    const blockedCart = await createCart(`blocked-${randomUUID()}`, database);
    await addCartItem(blockedCart.id, product.variantId, 1, database);
    await expect(
      createOrderFromCart(
        blockedCart.id,
        {
          addressLine: "67 Blocked Checkout Street",
          customerName: "Blocked Buyer",
          deliveryInstructions: null,
          deliveryZoneId,
          email: null,
          idempotencyKey: randomUUID(),
          landmark: null,
          mobileNumber: "+923001212121",
          policyConsent: "on",
          postalCode: null,
        },
        database,
      ),
    ).rejects.toEqual(new CheckoutError("checkout_blocked"));

    const first = await seedSubmittedOrder(3, "+923001313131");
    const second = await seedSubmittedOrder(3, "+923001313131");
    const flags = await database
      .select({ code: orderRiskFlags.code })
      .from(orderRiskFlags)
      .where(eq(orderRiskFlags.orderId, second.order.orderId));
    expect(first.order.orderId).not.toBe(second.order.orderId);
    expect(flags).toContainEqual({ code: "recent_mobile_order" });
  });

  it("rechecks delivery-zone COD limits inside the order transaction", async () => {
    const product = await seedCheckoutProduct(2);
    const deliveryZoneId = await seedDeliveryZone();
    await database
      .update(deliveryZones)
      .set({ codMaximumMinor: 5_000 })
      .where(eq(deliveryZones.id, deliveryZoneId));
    const cart = await createCart(`cod-limit-${randomUUID()}`, database);
    await addCartItem(cart.id, product.variantId, 1, database);
    await expect(
      createOrderFromCart(
        cart.id,
        {
          addressLine: "89 COD Limit Avenue",
          customerName: "COD Limit Buyer",
          deliveryInstructions: null,
          deliveryZoneId,
          email: null,
          idempotencyKey: randomUUID(),
          landmark: null,
          mobileNumber: "+923001414141",
          policyConsent: "on",
          postalCode: null,
        },
        database,
      ),
    ).rejects.toEqual(new CheckoutError("delivery_unsupported"));
  });

  it("records notification failure without corrupting the committed order", async () => {
    const { order } = await seedSubmittedOrder(2, "+923001010101");
    const handlers = createNotificationOutboxHandlers(
      {
        async send() {
          throw new Error("Synthetic provider outage");
        },
      },
      database,
    );
    await runOutboxWorker({ batchSize: 100, database, handlers, workerId: randomUUID() });
    const [persistedOrder] = await database
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, order.orderId));
    const [notification] = await database
      .select({ id: notifications.id, status: notifications.status })
      .from(notifications)
      .where(
        and(
          eq(notifications.orderId, order.orderId),
          eq(notifications.eventType, "order.received"),
        ),
      );
    const attempts =
      notification === undefined
        ? []
        : await database
            .select({ outcome: notificationAttempts.outcome })
            .from(notificationAttempts)
            .where(eq(notificationAttempts.notificationId, notification.id));
    expect(persistedOrder?.id).toBe(order.orderId);
    expect(notification?.status).toBe("failed");
    expect(attempts).toContainEqual({ outcome: "failed" });
  });

  it("requires phone verification before exposing guest order tracking", async () => {
    const { order } = await seedSubmittedOrder(2, "+923001919191");
    const issued = await issueTrackingChallenge(
      { mobileNumber: "+92 300 1919191", orderNumber: order.orderNumber.toLowerCase() },
      database,
    );
    expect(issued.developmentCode).toMatch(/^\d{6}$/);
    const verified = await verifyTrackingChallenge(
      { challengeId: issued.challengeId, code: issued.developmentCode ?? "" },
      database,
    );
    const tracked = await getTrackedOrder(order.orderNumber, verified.token, database);
    expect(tracked?.order.id).toBe(order.orderId);
    expect(tracked?.items).toHaveLength(1);
    await expect(getTrackedOrder(order.orderNumber, "invalid-token", database)).resolves.toBeNull();
  });

  it("does not reveal whether guest tracking lookup details matched", async () => {
    const issued = await issueTrackingChallenge(
      { mobileNumber: "+923009999999", orderNumber: "PM-NOT-AN-ORDER" },
      database,
    );
    const [challenge] = await database
      .select({ orderId: trackingChallenges.orderId })
      .from(trackingChallenges)
      .where(eq(trackingChallenges.id, issued.challengeId));
    expect(challenge?.orderId).toBeNull();
    await expect(
      verifyTrackingChallenge(
        { challengeId: issued.challengeId, code: issued.developmentCode ?? "" },
        database,
      ),
    ).rejects.toThrow("tracking_verification_failed");
  });

  it("allows a verified guest to cancel only before courier handoff", async () => {
    const { order } = await seedSubmittedOrder(2, "+923002020202");
    const issued = await issueTrackingChallenge(
      { mobileNumber: "+923002020202", orderNumber: order.orderNumber },
      database,
    );
    const verified = await verifyTrackingChallenge(
      { challengeId: issued.challengeId, code: issued.developmentCode ?? "" },
      database,
    );
    await cancelTrackedOrder(
      {
        orderNumber: order.orderNumber,
        reason: "Customer changed their mind",
        token: verified.token,
      },
      database,
    );
    const [cancelled] = await database
      .select({ lifecycle: orders.lifecycleState, fulfillment: orders.fulfillmentState })
      .from(orders)
      .where(eq(orders.id, order.orderId));
    const [reservation] = await database
      .select({ state: inventoryReservations.state })
      .from(inventoryReservations)
      .where(eq(inventoryReservations.orderId, order.orderId));
    expect(cancelled).toEqual({ lifecycle: "cancelled", fulfillment: "cancelled" });
    expect(reservation?.state).toBe("released");
  });

  it("processes a partial return and restores only inspected sellable units", async () => {
    const { order, product } = await seedSubmittedOrder(5, "+923003030303", 2);
    const principal = await seedOrderPrincipal();
    await deliverOrder(order.orderId, principal);
    const issued = await issueTrackingChallenge(
      { mobileNumber: "+923003030303", orderNumber: order.orderNumber },
      database,
    );
    const verified = await verifyTrackingChallenge(
      { challengeId: issued.challengeId, code: issued.developmentCode ?? "" },
      database,
    );
    const [orderItem] = await database
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.orderId));
    if (orderItem === undefined) throw new Error("Return order item missing");
    const returnId = await requestTrackedReturn(
      {
        orderItemId: orderItem.id,
        orderNumber: order.orderNumber,
        quantity: 1,
        reason: "Item did not fit",
        token: verified.token,
      },
      database,
    );
    await expect(
      requestTrackedReturn(
        {
          orderItemId: orderItem.id,
          orderNumber: order.orderNumber,
          quantity: 2,
          reason: "Invalid cumulative quantity",
          token: verified.token,
        },
        database,
      ),
    ).rejects.toThrow("return_quantity_invalid");
    const unauthorized = await seedOrderPrincipal([]);
    await expect(
      transitionReturn(
        { actor: unauthorized, nextState: "approved", reason: "Unauthorized approval", returnId },
        database,
      ),
    ).rejects.toThrow("return_access_denied");
    const deniedAudits = await database
      .select({ outcome: auditLogs.outcome })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, returnId),
          eq(auditLogs.action, "return.transition"),
          eq(auditLogs.outcome, "denied"),
        ),
      );
    expect(deniedAudits).toHaveLength(1);
    for (const nextState of ["approved", "in_transit", "received"] as const) {
      await transitionReturn(
        { actor: principal, nextState, reason: `Return moved to ${nextState}`, returnId },
        database,
      );
    }
    const [returnItem] = await database
      .select({ id: returnItems.id })
      .from(returnItems)
      .where(eq(returnItems.returnId, returnId));
    if (returnItem === undefined) throw new Error("Return item missing");
    await transitionReturn(
      {
        actor: principal,
        nextState: "inspected",
        reason: "One unit passed inspection",
        returnId,
        sellableQuantities: { [returnItem.id]: 1 },
      },
      database,
    );
    const [before] = await database
      .select({ quantity: inventoryItems.onHandQuantity })
      .from(inventoryItems)
      .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .where(eq(productVariants.id, product.variantId));
    await transitionReturn(
      { actor: principal, nextState: "resolved", reason: "Return resolved", returnId },
      database,
    );
    const [after] = await database
      .select({ quantity: inventoryItems.onHandQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.variantId, product.variantId));
    expect(after?.quantity).toBe((before?.quantity ?? 0) + 1);
    const movements = await database
      .select({ delta: inventoryMovements.quantityDelta })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.referenceType, "return"),
          eq(inventoryMovements.referenceId, returnId),
        ),
      );
    expect(movements).toContainEqual({ delta: 1 });
    await recordOfflineRefund(
      {
        actor: principal,
        amountMinor: 10_000,
        currencyCode: "PKR",
        externalReference: "BANK-RETURN-1",
        method: "bank_transfer",
        recipientConfirmed: true,
        returnId,
      },
      database,
    );
    const refunds = await database
      .select({ amount: refundRecords.amountMinor })
      .from(refundRecords)
      .where(eq(refundRecords.returnId, returnId));
    expect(refunds).toEqual([{ amount: 10_000 }]);
  });

  it("isolates customer order history and saved addresses by customer", async () => {
    const [firstUser, secondUser] = await database
      .insert(users)
      .values([
        { accountType: "customer", identityId: randomUUID() },
        { accountType: "customer", identityId: randomUUID() },
      ])
      .returning({ id: users.id });
    if (firstUser === undefined || secondUser === undefined)
      throw new Error("Customer seed failed");
    await database.insert(customerProfiles).values([
      { displayName: "First customer", userId: firstUser.id },
      { displayName: "Second customer", userId: secondUser.id },
    ]);
    const firstPrincipal: StaffPrincipal = {
      accountType: "customer",
      permissionKeys: new Set(),
      status: "active",
      userId: firstUser.id,
    };
    const secondPrincipal: StaffPrincipal = { ...firstPrincipal, userId: secondUser.id };
    const { order } = await seedSubmittedOrder();
    await database
      .update(orders)
      .set({ customerUserId: firstUser.id })
      .where(eq(orders.id, order.orderId));
    await saveCustomerAddress(
      {
        ...firstPrincipal,
      },
      {
        addressLine: "10 Customer Street",
        deliveryArea: "Test area",
        isDefault: true,
        label: "Home",
        landmark: null,
        mobileNumber: "+923004040404",
        postalCode: null,
        recipientName: "First customer",
      },
      database,
    );
    const firstAccount = await getCustomerAccount(firstPrincipal, database);
    const secondAccount = await getCustomerAccount(secondPrincipal, database);
    expect(firstAccount.addresses).toHaveLength(1);
    expect(secondAccount.addresses).toHaveLength(0);
    expect(firstAccount.orders).toHaveLength(1);
    expect(secondAccount.orders).toHaveLength(0);

    const session = await createCustomerTrackingSession(firstUser.id, order.orderNumber, database);
    expect(await getTrackedOrder(order.orderNumber, session.token, database)).not.toBeNull();
    await expect(
      createCustomerTrackingSession(secondUser.id, order.orderNumber, database),
    ).rejects.toThrow("order_access_denied");

    await deleteCustomerAddress(firstPrincipal, firstAccount.addresses[0]?.id ?? "", database);
    expect((await getCustomerAccount(firstPrincipal, database)).addresses).toHaveLength(0);
  });
});
