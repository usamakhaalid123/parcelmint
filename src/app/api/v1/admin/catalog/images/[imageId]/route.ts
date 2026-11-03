import { z } from "zod";

import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import {
  CatalogAuthorizationError,
  CatalogReferenceNotFoundError,
} from "@/modules/catalog/domain/errors";
import {
  downloadProductImage,
  ProductImageReadError,
} from "@/modules/catalog/server/product-image-service";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string }> },
): Promise<Response> {
  try {
    const { imageId } = await context.params;
    const image = await downloadProductImage({
      actor: await getCurrentPrincipal(),
      imageId,
    });

    return new Response(image.body, {
      headers: {
        ...privateHeaders,
        "Content-Disposition": "inline",
        "Content-Type": image.contentType,
      },
    });
  } catch (error) {
    if (error instanceof CatalogAuthorizationError) {
      return Response.json(
        { error: { code: "forbidden", message: "Product image access denied." } },
        { headers: privateHeaders, status: 403 },
      );
    }
    if (error instanceof CatalogReferenceNotFoundError || error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "not_found", message: "Product image not found." } },
        { headers: privateHeaders, status: 404 },
      );
    }
    if (error instanceof ProductImageReadError) {
      return Response.json(
        { error: { code: "storage_unavailable", message: "Product image is unavailable." } },
        { headers: privateHeaders, status: 502 },
      );
    }
    throw error;
  }
}
