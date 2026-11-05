import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { auditLogs, brands, categories } from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth/domain/authorization";
import {
  CatalogAuthorizationError,
  CatalogConflictError,
  CatalogReferenceNotFoundError,
} from "@/modules/catalog/domain/errors";
import {
  catalogArchiveSchema,
  createBrandSchema,
  createCategorySchema,
} from "@/modules/catalog/schemas/catalog-input";

type Database = ReturnType<typeof getDatabase>;

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error) || !("cause" in error)) return false;
  const cause = error.cause;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

async function requireCatalogManager(input: {
  action: string;
  actor: StaffPrincipal | null;
  correlationId: string;
  database: Database;
  resourceId?: string;
  resourceType: "brand" | "category";
}): Promise<StaffPrincipal> {
  const decision = authorizePermission(input.actor, "catalog.manage");
  if (decision.allowed) return decision.principal;

  await input.database.insert(auditLogs).values({
    action: input.action,
    actorUserId: input.actor?.userId,
    correlationId: input.correlationId,
    outcome: "denied",
    reason: decision.reason,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
  });
  throw new CatalogAuthorizationError();
}

export async function createBrand(
  input: z.input<typeof createBrandSchema> & {
    actor: StaffPrincipal | null;
    correlationId: string;
  },
  database: Database = getDatabase(),
): Promise<{ brandId: string }> {
  const values = createBrandSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const actor = await requireCatalogManager({
    action: "catalog.brand.create",
    actor: input.actor,
    correlationId,
    database,
    resourceId: values.slug,
    resourceType: "brand",
  });

  try {
    return await database.transaction(async (transaction) => {
      const [brand] = await transaction.insert(brands).values(values).returning({ id: brands.id });
      if (brand === undefined) throw new Error("BrandInsertFailed");
      await transaction.insert(auditLogs).values({
        action: "catalog.brand.create",
        actorUserId: actor.userId,
        correlationId,
        outcome: "success",
        resourceId: brand.id,
        resourceType: "brand",
      });
      return { brandId: brand.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CatalogConflictError("slug");
    throw error;
  }
}

export async function createCategory(
  input: z.input<typeof createCategorySchema> & {
    actor: StaffPrincipal | null;
    correlationId: string;
  },
  database: Database = getDatabase(),
): Promise<{ categoryId: string }> {
  const values = createCategorySchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const actor = await requireCatalogManager({
    action: "catalog.category.create",
    actor: input.actor,
    correlationId,
    database,
    resourceId: values.slug,
    resourceType: "category",
  });

  if (values.parentId !== null && values.parentId !== undefined) {
    const [parent] = await database
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, values.parentId), isNull(categories.archivedAt)))
      .limit(1);
    if (parent === undefined) throw new CatalogReferenceNotFoundError("category");
  }

  try {
    return await database.transaction(async (transaction) => {
      const [category] = await transaction
        .insert(categories)
        .values({
          ...values,
          description: values.description || null,
          parentId: values.parentId ?? null,
        })
        .returning({ id: categories.id });
      if (category === undefined) throw new Error("CategoryInsertFailed");
      await transaction.insert(auditLogs).values({
        action: "catalog.category.create",
        actorUserId: actor.userId,
        correlationId,
        metadata: { parentId: values.parentId ?? null },
        outcome: "success",
        resourceId: category.id,
        resourceType: "category",
      });
      return { categoryId: category.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CatalogConflictError("slug");
    throw error;
  }
}

async function setOrganizationArchiveState(input: {
  action: string;
  actor: StaffPrincipal | null;
  archived: boolean;
  correlationId: string;
  database: Database;
  reason: string;
  resourceId: string;
  resourceType: "brand" | "category";
}): Promise<void> {
  const actor = await requireCatalogManager(input);
  const table = input.resourceType === "brand" ? brands : categories;
  await input.database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(table)
      .set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(table.id, input.resourceId))
      .returning({ id: table.id });
    if (updated === undefined) throw new CatalogReferenceNotFoundError(input.resourceType);

    await transaction.insert(auditLogs).values({
      action: input.action,
      actorUserId: actor.userId,
      correlationId: input.correlationId,
      metadata: { archived: input.archived },
      outcome: "success",
      reason: input.reason,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
    });
  });
}

export async function setBrandArchived(
  input: z.input<typeof catalogArchiveSchema> & {
    actor: StaffPrincipal | null;
    correlationId: string;
  },
  database: Database = getDatabase(),
): Promise<void> {
  const values = catalogArchiveSchema.parse(input);
  return setOrganizationArchiveState({
    ...values,
    action: "catalog.brand.archive_state",
    actor: input.actor,
    correlationId: z.string().uuid().parse(input.correlationId),
    database,
    resourceType: "brand",
  });
}

export async function setCategoryArchived(
  input: z.input<typeof catalogArchiveSchema> & {
    actor: StaffPrincipal | null;
    correlationId: string;
  },
  database: Database = getDatabase(),
): Promise<void> {
  const values = catalogArchiveSchema.parse(input);
  return setOrganizationArchiveState({
    ...values,
    action: "catalog.category.archive_state",
    actor: input.actor,
    correlationId: z.string().uuid().parse(input.correlationId),
    database,
    resourceType: "category",
  });
}
