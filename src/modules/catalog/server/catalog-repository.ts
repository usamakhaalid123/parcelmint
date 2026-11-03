import { asc, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  brands,
  inventoryItems,
  inventoryMovements,
  productImages,
  products,
  productVariants,
} from "@/db/schema";
import { deriveInventoryAvailability } from "@/modules/catalog/domain/catalog-values";

export type CatalogProductListItem = {
  basePriceMinor: number;
  currencyCode: string;
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived" | "draft";
  updatedAt: Date;
  variantCount: number;
};

export async function listCatalogProducts(
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<CatalogProductListItem[]> {
  const rows = await database
    .select({
      basePriceMinor: products.basePriceMinor,
      currencyCode: products.currencyCode,
      id: products.id,
      name: products.name,
      slug: products.slug,
      status: products.status,
      updatedAt: products.updatedAt,
      variantId: productVariants.id,
    })
    .from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .orderBy(desc(products.updatedAt), asc(productVariants.position));

  const mapped = new Map<string, CatalogProductListItem>();
  for (const row of rows) {
    const existing = mapped.get(row.id);
    if (existing !== undefined) {
      if (row.variantId !== null) existing.variantCount += 1;
      continue;
    }

    mapped.set(row.id, {
      basePriceMinor: row.basePriceMinor,
      currencyCode: row.currencyCode,
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      updatedAt: row.updatedAt,
      variantCount: row.variantId === null ? 0 : 1,
    });
  }

  return [...mapped.values()];
}

export type CatalogVariantDetail = {
  availability: "in_stock" | "low_stock" | "out_of_stock" | "untracked";
  id: string;
  inventoryItemId: string;
  isActive: boolean;
  lowStockThreshold: number;
  onHandQuantity: number;
  priceOverrideMinor: number | null;
  reservedQuantity: number;
  sku: string;
  stockBehavior: "tracked" | "untracked";
  title: string;
};

export type CatalogProductDetail = {
  basePriceMinor: number;
  brandName: string | null;
  currencyCode: string;
  description: string;
  id: string;
  images: { altText: string; id: string; isPrimary: boolean; storageKey: string }[];
  name: string;
  slug: string;
  status: "active" | "archived" | "draft";
  variants: CatalogVariantDetail[];
  version: number;
};

export async function getCatalogProduct(
  productId: string,
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<CatalogProductDetail | null> {
  const rows = await database
    .select({
      basePriceMinor: products.basePriceMinor,
      brandName: brands.name,
      currencyCode: products.currencyCode,
      description: products.description,
      id: products.id,
      imageAltText: productImages.altText,
      imageId: productImages.id,
      imageIsPrimary: productImages.isPrimary,
      imageStorageKey: productImages.storageKey,
      inventoryItemId: inventoryItems.id,
      isActive: productVariants.isActive,
      lowStockThreshold: inventoryItems.lowStockThreshold,
      name: products.name,
      onHandQuantity: inventoryItems.onHandQuantity,
      priceOverrideMinor: productVariants.priceOverrideMinor,
      reservedQuantity: inventoryItems.reservedQuantity,
      sku: productVariants.sku,
      slug: products.slug,
      status: products.status,
      stockBehavior: productVariants.stockBehavior,
      variantId: productVariants.id,
      variantTitle: productVariants.title,
      version: products.version,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .leftJoin(productImages, eq(productImages.productId, products.id))
    .where(eq(products.id, productId))
    .orderBy(asc(productVariants.position), asc(productImages.position));

  const first = rows[0];
  if (first === undefined) return null;

  const variants = new Map<string, CatalogVariantDetail>();
  const images = new Map<
    string,
    { altText: string; id: string; isPrimary: boolean; storageKey: string }
  >();
  for (const row of rows) {
    if (
      row.imageId !== null &&
      row.imageAltText !== null &&
      row.imageIsPrimary !== null &&
      row.imageStorageKey !== null
    ) {
      images.set(row.imageId, {
        altText: row.imageAltText,
        id: row.imageId,
        isPrimary: row.imageIsPrimary,
        storageKey: row.imageStorageKey,
      });
    }
    if (
      row.variantId === null ||
      row.inventoryItemId === null ||
      row.isActive === null ||
      row.lowStockThreshold === null ||
      row.onHandQuantity === null ||
      row.reservedQuantity === null ||
      row.sku === null ||
      row.stockBehavior === null ||
      row.variantTitle === null
    ) {
      continue;
    }

    variants.set(row.variantId, {
      availability: deriveInventoryAvailability({
        isActive: row.isActive,
        lowStockThreshold: row.lowStockThreshold,
        onHandQuantity: row.onHandQuantity,
        reservedQuantity: row.reservedQuantity,
        stockBehavior: row.stockBehavior,
      }),
      id: row.variantId,
      inventoryItemId: row.inventoryItemId,
      isActive: row.isActive,
      lowStockThreshold: row.lowStockThreshold,
      onHandQuantity: row.onHandQuantity,
      priceOverrideMinor: row.priceOverrideMinor,
      reservedQuantity: row.reservedQuantity,
      sku: row.sku,
      stockBehavior: row.stockBehavior,
      title: row.variantTitle,
    });
  }

  return {
    basePriceMinor: first.basePriceMinor,
    brandName: first.brandName,
    currencyCode: first.currencyCode,
    description: first.description,
    id: first.id,
    images: [...images.values()],
    name: first.name,
    slug: first.slug,
    status: first.status,
    variants: [...variants.values()],
    version: first.version,
  };
}

export type InventoryMovementListItem = {
  actorUserId: string | null;
  delta: number;
  id: string;
  occurredAt: Date;
  quantityAfter: number;
  reason: string;
  sku: string;
  source: string;
};

export async function listProductInventoryMovements(
  productId: string,
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<InventoryMovementListItem[]> {
  return database
    .select({
      actorUserId: inventoryMovements.actorUserId,
      delta: inventoryMovements.quantityDelta,
      id: inventoryMovements.id,
      occurredAt: inventoryMovements.occurredAt,
      quantityAfter: inventoryMovements.quantityAfter,
      reason: inventoryMovements.reason,
      sku: productVariants.sku,
      source: inventoryMovements.source,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.inventoryItemId))
    .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .where(eq(productVariants.productId, productId))
    .orderBy(desc(inventoryMovements.occurredAt))
    .limit(50);
}
