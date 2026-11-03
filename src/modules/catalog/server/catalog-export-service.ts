import { asc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  brands,
  categories,
  inventoryItems,
  productCategories,
  productOptions,
  products,
  productVariants,
  variantOptionValues,
} from "@/db/schema";
import { catalogCsvHeaders, serializeCsv } from "@/modules/catalog/domain/catalog-csv";

export async function exportCatalogCsv(): Promise<string> {
  const rows = await getDatabase()
    .select({
      basePriceMinor: products.basePriceMinor,
      brandName: brands.name,
      brandSlug: brands.slug,
      categoryName: sql<string | null>`min(${categories.name})`,
      categorySlug: sql<string | null>`min(${categories.slug})`,
      currencyCode: products.currencyCode,
      description: products.description,
      initialQuantity: inventoryItems.onHandQuantity,
      lowStockThreshold: inventoryItems.lowStockThreshold,
      name: products.name,
      optionName: sql<string | null>`min(${productOptions.name})`,
      optionValue: sql<string | null>`min(${variantOptionValues.value})`,
      priceOverrideMinor: productVariants.priceOverrideMinor,
      sku: productVariants.sku,
      slug: products.slug,
      status: products.status,
      stockBehavior: productVariants.stockBehavior,
      variantTitle: productVariants.title,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .innerJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(productCategories, eq(productCategories.productId, products.id))
    .leftJoin(categories, eq(categories.id, productCategories.categoryId))
    .leftJoin(variantOptionValues, eq(variantOptionValues.variantId, productVariants.id))
    .leftJoin(productOptions, eq(productOptions.id, variantOptionValues.optionId))
    .groupBy(products.id, brands.id, productVariants.id, inventoryItems.id)
    .orderBy(asc(products.name), asc(productVariants.position));

  return serializeCsv([
    catalogCsvHeaders,
    ...rows.map((row) => [
      row.name,
      row.slug,
      row.description,
      row.status,
      row.currencyCode,
      row.basePriceMinor,
      row.brandName,
      row.brandSlug,
      row.categoryName,
      row.categorySlug,
      row.variantTitle,
      row.sku,
      row.priceOverrideMinor,
      row.stockBehavior,
      row.initialQuantity,
      row.lowStockThreshold,
      row.optionName,
      row.optionValue,
      "Imported from catalog export",
    ]),
  ]);
}
