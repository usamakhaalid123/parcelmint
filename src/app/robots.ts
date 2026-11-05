import type { MetadataRoute } from "next";

import { getServerEnvironment } from "@/config/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { allow: "/", disallow: ["/admin/", "/api/", "/auth/"] },
    sitemap: `${getServerEnvironment().appUrl}/sitemap.xml`,
  };
}
