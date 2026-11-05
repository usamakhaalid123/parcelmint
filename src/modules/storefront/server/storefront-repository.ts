import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  brands,
  categories,
  inventoryItems,
  productCategories,
  productImages,
  products,
  productVariants,
} from "@/db/schema";
import { getCatalogProduct, type CatalogVariantDetail } from "@/modules/catalog";
import type { StorefrontCatalogQuery } from "@/modules/storefront/schemas/catalog-query";

type Database = ReturnType<typeof getDatabase>;

export type StorefrontProductCard = {
  available: boolean;
  brandName: string | null;
  currencyCode: string;
  description: string;
  image: { altText: string; id: string } | null;
  minimumPriceMinor: number;
  name: string;
  slug: string;
};

export type StorefrontCatalogPage = {
  items: readonly StorefrontProductCard[];
  page: number;
  pageCount: number;
  total: number;
};

export type StorefrontFacets = {
  brands: readonly { name: string; slug: string }[];
  categories: readonly { name: string; slug: string }[];
};

const effectivePrice = sql<number>`coalesce(${productVariants.priceOverrideMinor}, ${products.basePriceMinor})`;
const productAvailable = sql<boolean>`bool_or(
  ${productVariants.stockBehavior} = 'untracked'
  OR (${inventoryItems.onHandQuantity} - ${inventoryItems.reservedQuantity}) > 0
)`;

export async function listStorefrontProducts(
  input: StorefrontCatalogQuery,
  database: Database = getDatabase(),
): Promise<StorefrontCatalogPage> {
  const pageSize = 12;
  const priceConditions = and(
    input.minPrice === undefined ? undefined : gte(effectivePrice, input.minPrice),
    input.maxPrice === undefined ? undefined : lte(effectivePrice, input.maxPrice),
  );
  const filtered = database.$with("storefront_filtered_products").as(
    database
      .select({
        available: productAvailable.as("available"),
        brandName: sql<string | null>`${brands.name}`.as("brand_name"),
        currencyCode: products.currencyCode,
        description: products.description,
        id: products.id,
        minimumPriceMinor: sql<number>`min(${effectivePrice})`
          .mapWith(Number)
          .as("minimum_price_minor"),
        name: sql<string>`${products.name}`.as("product_name"),
        slug: products.slug,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(productCategories, eq(productCategories.productId, products.id))
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(
        and(
          eq(products.status, "active"),
          eq(productVariants.isActive, true),
          isNull(brands.archivedAt),
          input.brand === undefined || input.brand === ""
            ? undefined
            : eq(brands.slug, input.brand),
          input.category === undefined || input.category === ""
            ? undefined
            : and(eq(categories.slug, input.category), isNull(categories.archivedAt)),
          input.query === undefined || input.query === ""
            ? undefined
            : or(
                ilike(products.name, `%${input.query}%`),
                ilike(products.description, `%${input.query}%`),
                ilike(productVariants.sku, `%${input.query}%`),
              ),
          priceConditions,
        ),
      )
      .groupBy(products.id, brands.id)
      .having(
        input.availability === undefined
          ? undefined
          : eq(productAvailable, input.availability === "in_stock"),
      ),
  );

  const order =
    input.sort === "name"
      ? asc(filtered.name)
      : input.sort === "price_asc"
        ? asc(filtered.minimumPriceMinor)
        : input.sort === "price_desc"
          ? desc(filtered.minimumPriceMinor)
          : desc(filtered.updatedAt);

  const [[totalRow], rows] = await Promise.all([
    database.with(filtered).select({ value: count() }).from(filtered),
    database
      .with(filtered)
      .select()
      .from(filtered)
      .orderBy(order, asc(filtered.name))
      .limit(pageSize)
      .offset((input.page - 1) * pageSize),
  ]);
  const ids = rows.map(({ id }) => id);
  const imageRows =
    ids.length === 0
      ? []
      : await database
          .select({
            altText: productImages.altText,
            id: productImages.id,
            productId: productImages.productId,
          })
          .from(productImages)
          .where(inArray(productImages.productId, ids))
          .orderBy(desc(productImages.isPrimary), asc(productImages.position));
  const images = new Map<string, { altText: string; id: string }>();
  for (const image of imageRows) {
    if (!images.has(image.productId)) images.set(image.productId, image);
  }
  const total = totalRow?.value ?? 0;

  return {
    items: rows.map((product) => ({
      available: product.available,
      brandName: product.brandName,
      currencyCode: product.currencyCode,
      description: product.description,
      image: images.get(product.id) ?? null,
      minimumPriceMinor: product.minimumPriceMinor,
      name: product.name,
      slug: product.slug,
    })),
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

export async function listStorefrontFacets(
  database: Database = getDatabase(),
): Promise<StorefrontFacets> {
  const [brandRows, categoryRows] = await Promise.all([
    database
      .selectDistinct({ name: brands.name, slug: brands.slug })
      .from(brands)
      .innerJoin(products, eq(products.brandId, brands.id))
      .where(and(eq(products.status, "active"), isNull(brands.archivedAt)))
      .orderBy(asc(brands.name)),
    database
      .selectDistinct({
        name: categories.name,
        position: categories.position,
        slug: categories.slug,
      })
      .from(categories)
      .innerJoin(productCategories, eq(productCategories.categoryId, categories.id))
      .innerJoin(products, eq(products.id, productCategories.productId))
      .where(and(eq(products.status, "active"), isNull(categories.archivedAt)))
      .orderBy(asc(categories.position), asc(categories.name)),
  ]);
  return {
    brands: brandRows,
    categories: categoryRows.map(({ name, slug }) => ({ name, slug })),
  };
}

export type StorefrontProductDetail = {
  basePriceMinor: number;
  brandName: string | null;
  categories: readonly { name: string; slug: string }[];
  currencyCode: string;
  description: string;
  id: string;
  images: readonly { altText: string; id: string; isPrimary: boolean }[];
  name: string;
  slug: string;
  variants: readonly CatalogVariantDetail[];
};

export async function getStorefrontProduct(
  slug: string,
  database: Database = getDatabase(),
): Promise<StorefrontProductDetail | null> {
  const [published] = await database
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "active")))
    .limit(1);
  if (published === undefined) return null;

  const [product, categoryRows] = await Promise.all([
    getCatalogProduct(published.id, database),
    database
      .select({ name: categories.name, slug: categories.slug })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(and(eq(productCategories.productId, published.id), isNull(categories.archivedAt)))
      .orderBy(asc(categories.position), asc(categories.name)),
  ]);
  if (product === null) return null;

  return {
    basePriceMinor: product.basePriceMinor,
    brandName: product.brandName,
    categories: categoryRows,
    currencyCode: product.currencyCode,
    description: product.description,
    id: product.id,
    images: product.images.map(({ altText, id, isPrimary }) => ({ altText, id, isPrimary })),
    name: product.name,
    slug: product.slug,
    variants: product.variants.filter(({ isActive }) => isActive),
  };
}

export async function listPublishedProductSlugs(database: Database = getDatabase()) {
  return database
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(eq(products.status, "active"))
    .orderBy(asc(products.slug));
}
