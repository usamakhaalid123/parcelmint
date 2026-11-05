import { z } from "zod";

import { CatalogReferenceNotFoundError } from "@/modules/catalog";
import {
  downloadPublishedProductImage,
  ProductImageReadError,
} from "@/modules/catalog/server/product-image-service";

export const dynamic = "force-dynamic";

const publicImageHeaders = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string }> },
): Promise<Response> {
  try {
    const image = await downloadPublishedProductImage((await context.params).imageId);
    return new Response(image.body, {
      headers: {
        ...publicImageHeaders,
        "Content-Disposition": "inline",
        "Content-Type": image.contentType,
      },
    });
  } catch (error) {
    if (error instanceof CatalogReferenceNotFoundError || error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "not_found", message: "Product image not found." } },
        { headers: publicImageHeaders, status: 404 },
      );
    }
    if (error instanceof ProductImageReadError) {
      return Response.json(
        { error: { code: "storage_unavailable", message: "Product image is unavailable." } },
        { headers: { "Cache-Control": "no-store" }, status: 502 },
      );
    }
    throw error;
  }
}
