import { unstable_cache } from "next/cache";

import {
  getStorefrontProduct,
  listPublishedProductSlugs,
  listStorefrontFacets,
  listStorefrontProducts,
} from "./storefront-repository";

const cacheOptions: { revalidate: number; tags: string[] } = {
  revalidate: 300,
  tags: ["storefront-catalog"],
};

export const getCachedStorefrontProduct = unstable_cache(
  getStorefrontProduct,
  ["storefront-product"],
  cacheOptions,
);
export const listCachedPublishedProductSlugs = unstable_cache(
  listPublishedProductSlugs,
  ["storefront-product-slugs"],
  cacheOptions,
);
export const listCachedStorefrontFacets = unstable_cache(
  listStorefrontFacets,
  ["storefront-facets"],
  cacheOptions,
);
export const listCachedStorefrontProducts = unstable_cache(
  listStorefrontProducts,
  ["storefront-products"],
  cacheOptions,
);
