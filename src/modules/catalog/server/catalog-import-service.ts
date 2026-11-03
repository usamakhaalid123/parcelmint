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
import { parseCatalogCsv } from "@/modules/catalog/domain/catalog-csv";
import { normalizeSku } from "@/modules/catalog/domain/catalog-values";
import { CatalogAuthorizationError } from "@/modules/catalog/domain/errors";

export async function importCatalogCsv(
  input: {
    actor: StaffPrincipal | null;
    correlationId: string;
    csvText: string;
  },
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<{ importedProducts: number }> {
  const correlationId = z.string().uuid().parse(input.correlationId);
  const rows = parseCatalogCsv(input.csvText);
  const catalogDecision = authorizePermission(input.actor, "catalog.manage");
  const inventoryDecision = authorizePermission(input.actor, "inventory.adjust");

  if (
    !catalogDecision.allowed ||
    (rows.some((row) => row.product.initialQuantity > 0) && !inventoryDecision.allowed)
  ) {
    const reason = !catalogDecision.allowed ? catalogDecision.reason : "missing_permission";
    await database.insert(auditLogs).values({
      action: "catalog.csv.import",
      actorUserId: input.actor?.userId,
      correlationId,
      metadata: { rowCount: rows.length },
      outcome: "denied",
      reason,
      resourceType: "catalog",
    });
    throw new CatalogAuthorizationError();
  }

  try {
    await database.transaction(async (transaction) => {
      for (const row of rows) {
        let brandId: string | undefined;
        if (row.product.brand !== null && row.product.brand !== undefined) {
          const [brand] = await transaction
            .insert(brands)
            .values(row.product.brand)
            .onConflictDoUpdate({
              target: brands.slug,
              set: { name: row.product.brand.name, updatedAt: new Date() },
            })
            .returning({ id: brands.id });
          brandId = brand?.id;
        }

        const [product] = await transaction
          .insert(products)
          .values({
            basePriceMinor: row.product.basePriceMinor,
            brandId,
            currencyCode: row.product.currencyCode,
            description: row.product.description,
            name: row.product.name,
            slug: row.product.slug,
            status: row.product.status,
          })
          .returning({ id: products.id });
        if (product === undefined) throw new Error("ProductInsertFailed");

        for (const categoryValue of row.product.categories) {
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

        const normalizedSku = normalizeSku(row.product.variant.sku);
        const [variant] = await transaction
          .insert(productVariants)
          .values({
            ...row.product.variant,
            normalizedSku,
            productId: product.id,
            sku: normalizedSku,
          })
          .returning({ id: productVariants.id });
        if (variant === undefined) throw new Error("ProductVariantInsertFailed");

        for (const [position, optionValue] of row.product.optionValues.entries()) {
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
            lowStockThreshold: row.product.lowStockThreshold,
            onHandQuantity: row.product.initialQuantity,
            variantId: variant.id,
          })
          .returning({ id: inventoryItems.id });
        if (inventoryItem === undefined) throw new Error("InventoryItemInsertFailed");

        if (row.product.initialQuantity > 0) {
          await transaction.insert(inventoryMovements).values({
            actorUserId: catalogDecision.principal.userId,
            correlationId,
            inventoryItemId: inventoryItem.id,
            metadata: { csvRow: row.rowNumber },
            quantityAfter: row.product.initialQuantity,
            quantityBefore: 0,
            quantityDelta: row.product.initialQuantity,
            reason: row.inventoryReason,
            source: "csv_import",
          });
        }

        await transaction.insert(auditLogs).values({
          action: "catalog.product.create",
          actorUserId: catalogDecision.principal.userId,
          correlationId,
          metadata: { csvRow: row.rowNumber, sku: normalizedSku },
          outcome: "success",
          reason: "CSV import",
          resourceId: product.id,
          resourceType: "product",
        });
      }

      await transaction.insert(auditLogs).values({
        action: "catalog.csv.import",
        actorUserId: catalogDecision.principal.userId,
        correlationId,
        metadata: { rowCount: rows.length },
        outcome: "success",
        resourceType: "catalog",
      });
    });
  } catch (error) {
    await database.insert(auditLogs).values({
      action: "catalog.csv.import",
      actorUserId: catalogDecision.principal.userId,
      correlationId,
      metadata: { rowCount: rows.length },
      outcome: "failure",
      reason: error instanceof Error ? error.name : "CatalogCsvImportFailed",
      resourceType: "catalog",
    });
    throw error;
  }

  return { importedProducts: rows.length };
}
