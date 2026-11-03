import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getProductStorageBucket } from "@/config/storage-env";
import { getDatabase } from "@/db/client";
import { auditLogs, productImages, products } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth/domain/authorization";
import {
  CatalogAuthorizationError,
  CatalogReferenceNotFoundError,
} from "@/modules/catalog/domain/errors";

const allowedImageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function getImageExtension(contentType: string): "jpg" | "png" | "webp" | undefined {
  if (contentType === "image/jpeg") return allowedImageTypes[contentType];
  if (contentType === "image/png") return allowedImageTypes[contentType];
  if (contentType === "image/webp") return allowedImageTypes[contentType];
  return undefined;
}

function hasMatchingImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (contentType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (contentType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

export class ProductImageUploadError extends Error {
  constructor(readonly reason: "invalid_file" | "storage_failed") {
    super("The product image could not be uploaded.");
    this.name = "ProductImageUploadError";
  }
}

export class ProductImageReadError extends Error {
  constructor() {
    super("The product image could not be read.");
    this.name = "ProductImageReadError";
  }
}

export async function downloadProductImage(
  input: { actor: StaffPrincipal | null; imageId: string },
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<{ body: Blob; contentType: string }> {
  const imageId = z.string().uuid().parse(input.imageId);
  const decision = authorizePermission(input.actor, "admin.access");
  if (!decision.allowed) throw new CatalogAuthorizationError();

  const [image] = await database
    .select({ storageKey: productImages.storageKey })
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (image === undefined) throw new CatalogReferenceNotFoundError("product_image");

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(getProductStorageBucket())
    .download(image.storageKey);
  if (error !== null || data === null) throw new ProductImageReadError();

  return {
    body: data,
    contentType: data.type || "application/octet-stream",
  };
}

export async function uploadProductImage(
  input: {
    actor: StaffPrincipal | null;
    altText: string;
    correlationId: string;
    file: File;
    isPrimary: boolean;
    productId: string;
  },
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<{ imageId: string }> {
  const productId = z.string().uuid().parse(input.productId);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const altText = z.string().trim().min(1).max(300).parse(input.altText);
  const decision = authorizePermission(input.actor, "catalog.manage");

  if (!decision.allowed) {
    await database.insert(auditLogs).values({
      action: "catalog.image.upload",
      actorUserId: input.actor?.userId,
      correlationId,
      outcome: "denied",
      reason: decision.reason,
      resourceId: productId,
      resourceType: "product",
    });
    throw new CatalogAuthorizationError();
  }

  const extension = getImageExtension(input.file.type);
  if (extension === undefined || input.file.size <= 0 || input.file.size > 5_000_000) {
    throw new ProductImageUploadError("invalid_file");
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (!hasMatchingImageSignature(input.file.type, bytes)) {
    throw new ProductImageUploadError("invalid_file");
  }

  const [product] = await database
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (product === undefined) throw new CatalogReferenceNotFoundError("product");

  const bucket = getProductStorageBucket();
  const storageKey = `products/${productId}/${randomUUID()}.${extension}`;
  const supabase = createSupabaseAdminClient();
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storageKey, bytes, {
    cacheControl: "31536000",
    contentType: input.file.type,
    upsert: false,
  });
  if (uploadError !== null) throw new ProductImageUploadError("storage_failed");

  try {
    return await database.transaction(async (transaction) => {
      const [nextPosition] = await transaction
        .select({ value: sql<number>`coalesce(max(${productImages.position}), -1) + 1` })
        .from(productImages)
        .where(eq(productImages.productId, productId));

      if (input.isPrimary) {
        await transaction
          .update(productImages)
          .set({ isPrimary: false })
          .where(and(eq(productImages.productId, productId), isNull(productImages.variantId)));
      }

      const [image] = await transaction
        .insert(productImages)
        .values({
          altText,
          isPrimary: input.isPrimary,
          position: nextPosition?.value ?? 0,
          productId,
          storageKey,
        })
        .returning({ id: productImages.id });
      if (image === undefined) throw new Error("ProductImageInsertFailed");

      await transaction.insert(auditLogs).values({
        action: "catalog.image.upload",
        actorUserId: decision.principal.userId,
        correlationId,
        metadata: { isPrimary: input.isPrimary },
        outcome: "success",
        resourceId: image.id,
        resourceType: "product_image",
      });
      return { imageId: image.id };
    });
  } catch (error) {
    await supabase.storage.from(bucket).remove([storageKey]);
    throw error;
  }
}
