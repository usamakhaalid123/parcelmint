import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  auditLogs,
  brands,
  categories,
  inventoryItems,
  inventoryMovements,
  productCategories,
  productOptions,
  products,
  productVariants,
  variantOptionValues,
} from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth/domain/authorization";
import { normalizeSku } from "@/modules/catalog/domain/catalog-values";
import {
  CatalogAuthorizationError,
  CatalogConflictError,
  CatalogConcurrentModificationError,
  CatalogReferenceNotFoundError,
  InventoryAdjustmentError,
} from "@/modules/catalog/domain/errors";
import {
  addProductVariantSchema,
  createProductSchema,
  inventoryAdjustmentSchema,
  productStatusChangeSchema,
  updateProductSchema,
} from "@/modules/catalog/schemas/catalog-input";

type Database = ReturnType<typeof getDatabase>;

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error) || !("cause" in error)) {
    return false;
  }

  const cause = error.cause;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

function uniqueConflictField(error: unknown): "sku" | "slug" {
  if (error instanceof Error && "cause" in error) {
    const cause = error.cause;
    if (typeof cause === "object" && cause !== null && "constraint" in cause) {
      const constraint = cause.constraint;
      if (typeof constraint === "string" && constraint.includes("sku")) return "sku";
    }
  }
  return "slug";
}

async function recordDeniedOperation(input: {
  action: string;
  actor: StaffPrincipal | null;
  correlationId: string;
  database: Database;
  reason: string;
  resourceId?: string;
  resourceType: string;
}): Promise<never> {
  await input.database.insert(auditLogs).values({
    action: input.action,
    actorUserId: input.actor?.userId,
    correlationId: input.correlationId,
    outcome: "denied",
    reason: input.reason,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
  });
  throw new CatalogAuthorizationError();
}

export type CreateCompleteProductInput = z.input<typeof createProductSchema> & {
  actor: StaffPrincipal | null;
  correlationId: string;
  inventoryReason: string;
};

export type CreatedProduct = {
  inventoryItemId: string;
  productId: string;
  variantId: string;
};

export async function createCompleteProduct(
  input: CreateCompleteProductInput,
  database: Database = getDatabase(),
): Promise<CreatedProduct> {
  const values = createProductSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const inventoryReason = z.string().trim().min(3).max(500).parse(input.inventoryReason);
  const catalogDecision = authorizePermission(input.actor, "catalog.manage");

  if (!catalogDecision.allowed) {
    return recordDeniedOperation({
      action: "catalog.product.create",
      actor: input.actor,
      correlationId,
      database,
      reason: catalogDecision.reason,
      resourceId: values.slug,
      resourceType: "product",
    });
  }

  if (values.initialQuantity > 0) {
    const inventoryDecision = authorizePermission(input.actor, "inventory.adjust");
    if (!inventoryDecision.allowed) {
      return recordDeniedOperation({
        action: "inventory.initialize",
        actor: input.actor,
        correlationId,
        database,
        reason: inventoryDecision.reason,
        resourceId: values.variant.sku,
        resourceType: "product_variant",
      });
    }
  }

  try {
    return await database.transaction(async (transaction) => {
      let brandId: string | undefined;

      if (values.brand !== null && values.brand !== undefined) {
        const [brand] = await transaction
          .insert(brands)
          .values(values.brand)
          .onConflictDoUpdate({
            target: brands.slug,
            set: { name: values.brand.name, updatedAt: new Date() },
          })
          .returning({ id: brands.id });
        brandId = brand?.id;
      }

      const [product] = await transaction
        .insert(products)
        .values({
          basePriceMinor: values.basePriceMinor,
          brandId,
          currencyCode: values.currencyCode,
          description: values.description,
          name: values.name,
          slug: values.slug,
          status: values.status,
        })
        .returning({ id: products.id });

      if (product === undefined) {
        throw new Error("ProductInsertFailed");
      }

      for (const categoryValue of values.categories) {
        const [category] = await transaction
          .insert(categories)
          .values(categoryValue)
          .onConflictDoUpdate({
            target: categories.slug,
            set: { name: categoryValue.name, updatedAt: new Date() },
          })
          .returning({ id: categories.id });

        if (category !== undefined) {
          await transaction.insert(productCategories).values({
            categoryId: category.id,
            productId: product.id,
          });
        }
      }

      const normalizedSku = normalizeSku(values.variant.sku);
      const [variant] = await transaction
        .insert(productVariants)
        .values({
          ...values.variant,
          normalizedSku,
          productId: product.id,
          sku: normalizedSku,
        })
        .returning({ id: productVariants.id });

      if (variant === undefined) {
        throw new Error("ProductVariantInsertFailed");
      }

      for (const [position, optionValue] of values.optionValues.entries()) {
        const [option] = await transaction
          .insert(productOptions)
          .values({ name: optionValue.name, position, productId: product.id })
          .returning({ id: productOptions.id });

        if (option !== undefined) {
          await transaction.insert(variantOptionValues).values({
            optionId: option.id,
            value: optionValue.value,
            variantId: variant.id,
          });
        }
      }

      const [inventoryItem] = await transaction
        .insert(inventoryItems)
        .values({
          lowStockThreshold: values.lowStockThreshold,
          onHandQuantity: values.initialQuantity,
          variantId: variant.id,
        })
        .returning({ id: inventoryItems.id });

      if (inventoryItem === undefined) {
        throw new Error("InventoryItemInsertFailed");
      }

      if (values.initialQuantity > 0) {
        await transaction.insert(inventoryMovements).values({
          actorUserId: catalogDecision.principal.userId,
          correlationId,
          inventoryItemId: inventoryItem.id,
          quantityAfter: values.initialQuantity,
          quantityBefore: 0,
          quantityDelta: values.initialQuantity,
          reason: inventoryReason,
          source: "initial",
        });
      }

      await transaction.insert(auditLogs).values({
        action: "catalog.product.create",
        actorUserId: catalogDecision.principal.userId,
        correlationId,
        metadata: { sku: normalizedSku, status: values.status },
        outcome: "success",
        resourceId: product.id,
        resourceType: "product",
      });

      return {
        inventoryItemId: inventoryItem.id,
        productId: product.id,
        variantId: variant.id,
      };
    });
  } catch (error) {
    await database.insert(auditLogs).values({
      action: "catalog.product.create",
      actorUserId: catalogDecision.principal.userId,
      correlationId,
      outcome: "failure",
      reason: isUniqueViolation(error) ? "CatalogUniquenessConflict" : "CatalogProductCreateFailed",
      resourceId: values.slug,
      resourceType: "product",
    });

    if (isUniqueViolation(error)) {
      throw new CatalogConflictError(uniqueConflictField(error));
    }
    throw error;
  }
}

export type AdjustInventoryInput = z.input<typeof inventoryAdjustmentSchema> & {
  actor: StaffPrincipal | null;
  correlationId: string;
};

export type AddProductVariantInput = z.input<typeof addProductVariantSchema> & {
  actor: StaffPrincipal | null;
  correlationId: string;
  inventoryReason: string;
};

export async function addProductVariant(
  input: AddProductVariantInput,
  database: Database = getDatabase(),
): Promise<{ inventoryItemId: string; variantId: string }> {
  const values = addProductVariantSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const inventoryReason = z.string().trim().min(3).max(500).parse(input.inventoryReason);
  const catalogDecision = authorizePermission(input.actor, "catalog.manage");

  if (!catalogDecision.allowed) {
    return recordDeniedOperation({
      action: "catalog.variant.create",
      actor: input.actor,
      correlationId,
      database,
      reason: catalogDecision.reason,
      resourceId: values.productId,
      resourceType: "product",
    });
  }

  if (values.initialQuantity > 0) {
    const inventoryDecision = authorizePermission(input.actor, "inventory.adjust");
    if (!inventoryDecision.allowed) {
      return recordDeniedOperation({
        action: "inventory.initialize",
        actor: input.actor,
        correlationId,
        database,
        reason: inventoryDecision.reason,
        resourceId: values.variant.sku,
        resourceType: "product_variant",
      });
    }
  }

  try {
    return await database.transaction(async (transaction) => {
      const [product] = await transaction
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, values.productId))
        .limit(1);
      if (product === undefined) throw new CatalogReferenceNotFoundError("product");

      const normalizedSku = normalizeSku(values.variant.sku);
      const [variant] = await transaction
        .insert(productVariants)
        .values({
          ...values.variant,
          normalizedSku,
          productId: product.id,
          sku: normalizedSku,
        })
        .returning({ id: productVariants.id });
      if (variant === undefined) throw new Error("ProductVariantInsertFailed");

      for (const [position, optionValue] of values.optionValues.entries()) {
        const [option] = await transaction
          .insert(productOptions)
          .values({ name: optionValue.name, position, productId: product.id })
          .onConflictDoUpdate({
            target: [productOptions.productId, productOptions.name],
            set: { position },
          })
          .returning({ id: productOptions.id });
        if (option !== undefined) {
          await transaction.insert(variantOptionValues).values({
            optionId: option.id,
            value: optionValue.value,
            variantId: variant.id,
          });
        }
      }

      const [inventoryItem] = await transaction
        .insert(inventoryItems)
        .values({
          lowStockThreshold: values.lowStockThreshold,
          onHandQuantity: values.initialQuantity,
          variantId: variant.id,
        })
        .returning({ id: inventoryItems.id });
      if (inventoryItem === undefined) throw new Error("InventoryItemInsertFailed");

      if (values.initialQuantity > 0) {
        await transaction.insert(inventoryMovements).values({
          actorUserId: catalogDecision.principal.userId,
          correlationId,
          inventoryItemId: inventoryItem.id,
          quantityAfter: values.initialQuantity,
          quantityBefore: 0,
          quantityDelta: values.initialQuantity,
          reason: inventoryReason,
          source: "initial",
        });
      }

      await transaction.insert(auditLogs).values({
        action: "catalog.variant.create",
        actorUserId: catalogDecision.principal.userId,
        correlationId,
        metadata: { sku: normalizedSku },
        outcome: "success",
        resourceId: variant.id,
        resourceType: "product_variant",
      });

      return { inventoryItemId: inventoryItem.id, variantId: variant.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CatalogConflictError(uniqueConflictField(error));
    throw error;
  }
}

export async function adjustInventory(
  input: AdjustInventoryInput,
  database: Database = getDatabase(),
): Promise<{ onHandQuantity: number; version: number }> {
  const values = inventoryAdjustmentSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const decision = authorizePermission(input.actor, "inventory.adjust");

  if (!decision.allowed) {
    return recordDeniedOperation({
      action: "inventory.adjust",
      actor: input.actor,
      correlationId,
      database,
      reason: decision.reason,
      resourceId: values.inventoryItemId,
      resourceType: "inventory_item",
    });
  }

  try {
    return await database.transaction(async (transaction) => {
      const [item] = await transaction
        .select({
          onHandQuantity: inventoryItems.onHandQuantity,
          reservedQuantity: inventoryItems.reservedQuantity,
          stockBehavior: productVariants.stockBehavior,
          version: inventoryItems.version,
        })
        .from(inventoryItems)
        .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
        .where(eq(inventoryItems.id, values.inventoryItemId))
        .for("update")
        .limit(1);

      if (item === undefined) {
        throw new CatalogReferenceNotFoundError("inventory_item");
      }
      if (item.stockBehavior === "untracked") {
        throw new InventoryAdjustmentError("untracked_variant");
      }

      const quantityAfter = item.onHandQuantity + values.delta;
      if (quantityAfter < 0) {
        throw new InventoryAdjustmentError("insufficient_on_hand");
      }
      if (quantityAfter < item.reservedQuantity) {
        throw new InventoryAdjustmentError("reserved_quantity_conflict");
      }

      const [updated] = await transaction
        .update(inventoryItems)
        .set({
          onHandQuantity: quantityAfter,
          updatedAt: new Date(),
          version: sql`${inventoryItems.version} + 1`,
        })
        .where(
          and(
            eq(inventoryItems.id, values.inventoryItemId),
            eq(inventoryItems.version, item.version),
          ),
        )
        .returning({
          onHandQuantity: inventoryItems.onHandQuantity,
          version: inventoryItems.version,
        });

      if (updated === undefined) {
        throw new Error("InventoryConcurrentModification");
      }

      await transaction.insert(inventoryMovements).values({
        actorUserId: decision.principal.userId,
        correlationId,
        inventoryItemId: values.inventoryItemId,
        quantityAfter,
        quantityBefore: item.onHandQuantity,
        quantityDelta: values.delta,
        reason: values.reason,
        source: "adjustment",
      });

      await transaction.insert(auditLogs).values({
        action: "inventory.adjust",
        actorUserId: decision.principal.userId,
        correlationId,
        metadata: { delta: values.delta, quantityAfter },
        outcome: "success",
        reason: values.reason,
        resourceId: values.inventoryItemId,
        resourceType: "inventory_item",
      });

      return updated;
    });
  } catch (error) {
    await database.insert(auditLogs).values({
      action: "inventory.adjust",
      actorUserId: decision.principal.userId,
      correlationId,
      outcome: "failure",
      reason: error instanceof Error ? error.name : "InventoryAdjustmentFailed",
      resourceId: values.inventoryItemId,
      resourceType: "inventory_item",
    });
    throw error;
  }
}

export type ChangeProductStatusInput = z.input<typeof productStatusChangeSchema> & {
  actor: StaffPrincipal | null;
  correlationId: string;
};

export async function changeProductStatus(
  input: ChangeProductStatusInput,
  database: Database = getDatabase(),
): Promise<void> {
  const values = productStatusChangeSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const decision = authorizePermission(input.actor, "catalog.manage");

  if (!decision.allowed) {
    return recordDeniedOperation({
      action: "catalog.product.status_change",
      actor: input.actor,
      correlationId,
      database,
      reason: decision.reason,
      resourceId: values.productId,
      resourceType: "product",
    });
  }

  await database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(products)
      .set({
        status: values.status,
        updatedAt: new Date(),
        version: sql`${products.version} + 1`,
      })
      .where(eq(products.id, values.productId))
      .returning({ id: products.id });

    if (updated === undefined) {
      throw new CatalogReferenceNotFoundError("product");
    }

    await transaction.insert(auditLogs).values({
      action: "catalog.product.status_change",
      actorUserId: decision.principal.userId,
      correlationId,
      metadata: { status: values.status },
      outcome: "success",
      reason: values.reason,
      resourceId: values.productId,
      resourceType: "product",
    });
  });
}

export type UpdateProductInput = z.input<typeof updateProductSchema> & {
  actor: StaffPrincipal | null;
  correlationId: string;
  reason: string;
};

export async function updateProduct(
  input: UpdateProductInput,
  database: Database = getDatabase(),
): Promise<{ version: number }> {
  const values = updateProductSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const reason = z.string().trim().min(3).max(500).parse(input.reason);
  const decision = authorizePermission(input.actor, "catalog.manage");
  if (!decision.allowed) {
    return recordDeniedOperation({
      action: "catalog.product.update",
      actor: input.actor,
      correlationId,
      database,
      reason: decision.reason,
      resourceId: values.productId,
      resourceType: "product",
    });
  }

  try {
    return await database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(products)
        .set({
          basePriceMinor: values.basePriceMinor,
          currencyCode: values.currencyCode,
          description: values.description,
          name: values.name,
          slug: values.slug,
          updatedAt: new Date(),
          version: sql`${products.version} + 1`,
        })
        .where(and(eq(products.id, values.productId), eq(products.version, values.version)))
        .returning({ version: products.version });
      if (updated === undefined) throw new CatalogConcurrentModificationError();

      await transaction.insert(auditLogs).values({
        action: "catalog.product.update",
        actorUserId: decision.principal.userId,
        correlationId,
        outcome: "success",
        reason,
        resourceId: values.productId,
        resourceType: "product",
      });
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CatalogConflictError(uniqueConflictField(error));
    throw error;
  }
}
