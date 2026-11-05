import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  brands,
  categories,
  inventoryItems,
  inventoryMovements,
  productImages,
  productCategories,
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

export type CatalogOrganization = {
  brands: readonly {
    archived: boolean;
    id: string;
    name: string;
    slug: string;
  }[];
  categories: readonly {
    archived: boolean;
    id: string;
    name: string;
    parentId: string | null;
    parentName: string | null;
    position: number;
    slug: string;
  }[];
};

export async function listCatalogOrganization(
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<CatalogOrganization> {
  const [brandRows, categoryRows] = await Promise.all([
    database
      .select({
        archivedAt: brands.archivedAt,
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
      })
      .from(brands)
      .orderBy(asc(brands.name)),
    database
      .select({
        archivedAt: categories.archivedAt,
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        position: categories.position,
        slug: categories.slug,
      })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.name)),
  ]);
  const categoryNames = new Map(categoryRows.map((category) => [category.id, category.name]));

  return {
    brands: brandRows.map(({ archivedAt, ...brand }) => ({
      ...brand,
      archived: archivedAt !== null,
    })),
    categories: categoryRows.map(({ archivedAt, ...category }) => ({
      ...category,
      archived: archivedAt !== null,
      parentName:
        category.parentId === null ? null : (categoryNames.get(category.parentId) ?? null),
    })),
  };
}

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

export type CatalogProductPage = {
  items: readonly CatalogProductListItem[];
  page: number;
  pageCount: number;
  total: number;
};

export async function listCatalogProductPage(
  input: { page: number; query?: string; status?: "active" | "archived" | "draft" },
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<CatalogProductPage> {
  const pageSize = 20;
  const page = Math.max(1, input.page);
  const query = input.query?.trim();
  const condition = and(
    input.status === undefined ? undefined : eq(products.status, input.status),
    query === undefined || query === ""
      ? undefined
      : or(ilike(products.name, `%${query}%`), ilike(products.slug, `%${query}%`)),
  );
  const [[totalRow], productRows] = await Promise.all([
    database.select({ value: count() }).from(products).where(condition),
    database
      .select({
        basePriceMinor: products.basePriceMinor,
        currencyCode: products.currencyCode,
        id: products.id,
        name: products.name,
        slug: products.slug,
        status: products.status,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(condition)
      .orderBy(desc(products.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  const ids = productRows.map(({ id }) => id);
  const variantRows =
    ids.length === 0
      ? []
      : await database
          .select({ productId: productVariants.productId, value: count() })
          .from(productVariants)
          .where(inArray(productVariants.productId, ids))
          .groupBy(productVariants.productId);
  const variantCounts = new Map(variantRows.map((row) => [row.productId, row.value]));
  const total = totalRow?.value ?? 0;

  return {
    items: productRows.map((product) => ({
      ...product,
      variantCount: variantCounts.get(product.id) ?? 0,
    })),
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

export type CatalogVariantDetail = {
  availability: "in_stock" | "low_stock" | "out_of_stock" | "untracked";
  heightMillimeters: number | null;
  id: string;
  inventoryItemId: string;
  isActive: boolean;
  lengthMillimeters: number | null;
  lowStockThreshold: number;
  onHandQuantity: number;
  priceOverrideMinor: number | null;
  reservedQuantity: number;
  sku: string;
  stockBehavior: "tracked" | "untracked";
  title: string;
  version: number;
  weightGrams: number | null;
  widthMillimeters: number | null;
};

export type CatalogProductDetail = {
  basePriceMinor: number;
  brandName: string | null;
  brandId: string | null;
  categoryIds: string[];
  currencyCode: string;
  description: string;
  id: string;
  images: {
    altText: string;
    id: string;
    isPrimary: boolean;
    position: number;
    storageKey: string;
  }[];
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
      brandId: brands.id,
      categoryId: productCategories.categoryId,
      currencyCode: products.currencyCode,
      description: products.description,
      id: products.id,
      imageAltText: productImages.altText,
      imageId: productImages.id,
      imageIsPrimary: productImages.isPrimary,
      imagePosition: productImages.position,
      imageStorageKey: productImages.storageKey,
      heightMillimeters: productVariants.heightMillimeters,
      inventoryItemId: inventoryItems.id,
      isActive: productVariants.isActive,
      lengthMillimeters: productVariants.lengthMillimeters,
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
      variantVersion: productVariants.version,
      version: products.version,
      weightGrams: productVariants.weightGrams,
      widthMillimeters: productVariants.widthMillimeters,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(productCategories, eq(productCategories.productId, products.id))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .leftJoin(productImages, eq(productImages.productId, products.id))
    .where(eq(products.id, productId))
    .orderBy(asc(productVariants.position), asc(productImages.position));

  const first = rows[0];
  if (first === undefined) return null;

  const variants = new Map<string, CatalogVariantDetail>();
  const categoryIds = new Set<string>();
  const images = new Map<
    string,
    { altText: string; id: string; isPrimary: boolean; position: number; storageKey: string }
  >();
  for (const row of rows) {
    if (row.categoryId !== null) categoryIds.add(row.categoryId);
    if (
      row.imageId !== null &&
      row.imageAltText !== null &&
      row.imageIsPrimary !== null &&
      row.imagePosition !== null &&
      row.imageStorageKey !== null
    ) {
      images.set(row.imageId, {
        altText: row.imageAltText,
        id: row.imageId,
        isPrimary: row.imageIsPrimary,
        position: row.imagePosition,
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
      row.variantTitle === null ||
      row.variantVersion === null
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
      heightMillimeters: row.heightMillimeters,
      inventoryItemId: row.inventoryItemId,
      isActive: row.isActive,
      lengthMillimeters: row.lengthMillimeters,
      lowStockThreshold: row.lowStockThreshold,
      onHandQuantity: row.onHandQuantity,
      priceOverrideMinor: row.priceOverrideMinor,
      reservedQuantity: row.reservedQuantity,
      sku: row.sku,
      stockBehavior: row.stockBehavior,
      title: row.variantTitle,
      version: row.variantVersion,
      weightGrams: row.weightGrams,
      widthMillimeters: row.widthMillimeters,
    });
  }

  return {
    basePriceMinor: first.basePriceMinor,
    brandId: first.brandId,
    brandName: first.brandName,
    categoryIds: [...categoryIds],
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
