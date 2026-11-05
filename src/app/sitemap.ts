import type { MetadataRoute } from "next";

import { getServerEnvironment } from "@/config/env";
import { listCachedPublishedProductSlugs } from "@/modules/storefront";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getServerEnvironment().appUrl;
  const products = await listCachedPublishedProductSlugs();
  const staticPaths = [
    "",
    "/products",
    "/about",
    "/help",
    "/content/contact",
    "/content/faq",
    "/content/shipping",
    "/content/returns",
    "/content/privacy",
    "/content/terms",
  ];
  return [
    ...staticPaths.map((path) => ({
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.6,
      url: `${baseUrl}${path}`,
    })),
    ...products.map(({ slug, updatedAt }) => ({
      changeFrequency: "weekly" as const,
      lastModified: updatedAt,
      priority: 0.8,
      url: `${baseUrl}/products/${slug}`,
    })),
  ];
}
