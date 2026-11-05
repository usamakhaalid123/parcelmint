import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
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
import {
  productImageMutationSchema,
  productImageReorderSchema,
} from "@/modules/catalog/schemas/catalog-input";

const allowedImageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ProductImageStorage = {
  download(storageKey: string): Promise<Blob | null>;
  remove(storageKey: string): Promise<boolean>;
  upload(input: { bytes: Uint8Array; contentType: string; storageKey: string }): Promise<boolean>;
};

function createProductImageStorage(): ProductImageStorage {
  const bucket = getProductStorageBucket();
  const storage = createSupabaseAdminClient().storage.from(bucket);
  return {
    async download(storageKey) {
      const { data, error } = await storage.download(storageKey);
      return error === null ? data : null;
    },
    async remove(storageKey) {
      const { error } = await storage.remove([storageKey]);
      return error === null;
    },
    async upload({ bytes, contentType, storageKey }) {
      const { error } = await storage.upload(storageKey, bytes, {
        cacheControl: "31536000",
        contentType,
        upsert: false,
      });
      return error === null;
    },
  };
}

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

export class ProductImageMutationError extends Error {
  constructor(readonly reason: "storage_failed") {
    super("The product image could not be changed.");
    this.name = "ProductImageMutationError";
  }
}

async function requireImageManager(input: {
  actor: StaffPrincipal | null;
  correlationId: string;
  database: ReturnType<typeof getDatabase>;
  imageId: string;
  productId: string;
}): Promise<StaffPrincipal> {
  const decision = authorizePermission(input.actor, "catalog.manage");
  if (decision.allowed) return decision.principal;

  await input.database.insert(auditLogs).values({
    action: "catalog.image.manage",
    actorUserId: input.actor?.userId,
    correlationId: input.correlationId,
    outcome: "denied",
    reason: decision.reason,
    resourceId: input.imageId,
    resourceType: "product_image",
  });
  throw new CatalogAuthorizationError();
}

export async function downloadProductImage(
  input: { actor: StaffPrincipal | null; imageId: string },
  database: ReturnType<typeof getDatabase> = getDatabase(),
  storage?: ProductImageStorage,
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

  const body = await (storage ?? createProductImageStorage()).download(image.storageKey);
  if (body === null) throw new ProductImageReadError();

  return {
    body,
    contentType: body.type || "application/octet-stream",
  };
}

export async function downloadPublishedProductImage(
  imageIdInput: string,
  database: ReturnType<typeof getDatabase> = getDatabase(),
  storage?: ProductImageStorage,
): Promise<{ body: Blob; contentType: string }> {
  const imageId = z.string().uuid().parse(imageIdInput);
  const [image] = await database
    .select({ storageKey: productImages.storageKey })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(and(eq(productImages.id, imageId), eq(products.status, "active")))
    .limit(1);
  if (image === undefined) throw new CatalogReferenceNotFoundError("product_image");

  const body = await (storage ?? createProductImageStorage()).download(image.storageKey);
  if (body === null) throw new ProductImageReadError();
  return { body, contentType: body.type || "application/octet-stream" };
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
  storage?: ProductImageStorage,
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

  const storageKey = `products/${productId}/${randomUUID()}.${extension}`;
  const imageStorage = storage ?? createProductImageStorage();
  const uploaded = await imageStorage.upload({
    bytes,
    contentType: input.file.type,
    storageKey,
  });
  if (!uploaded) throw new ProductImageUploadError("storage_failed");

  try {
    return await database.transaction(async (transaction) => {
      await transaction
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .for("update");
      const [nextPosition] = await transaction
        .select({ value: sql<number>`coalesce(max(${productImages.position}), -1) + 1` })
        .from(productImages)
        .where(eq(productImages.productId, productId));

      const isPrimary = input.isPrimary || (nextPosition?.value ?? 0) === 0;
      if (isPrimary) {
        await transaction
          .update(productImages)
          .set({ isPrimary: false })
          .where(and(eq(productImages.productId, productId), isNull(productImages.variantId)));
      }

      const [image] = await transaction
        .insert(productImages)
        .values({
          altText,
          isPrimary,
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
        metadata: { isPrimary },
        outcome: "success",
        resourceId: image.id,
        resourceType: "product_image",
      });
      return { imageId: image.id };
    });
  } catch (error) {
    await imageStorage.remove(storageKey);
    throw error;
  }
}

export async function setPrimaryProductImage(
  input: z.input<typeof productImageMutationSchema> & {
    actor: StaffPrincipal | null;
    correlationId: string;
  },
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<void> {
  const values = productImageMutationSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const actor = await requireImageManager({
    ...values,
    actor: input.actor,
    correlationId,
    database,
  });

  await database.transaction(async (transaction) => {
    const [image] = await transaction
      .select({ id: productImages.id })
      .from(productImages)
      .where(
        and(eq(productImages.id, values.imageId), eq(productImages.productId, values.productId)),
      )
      .limit(1);
    if (image === undefined) throw new CatalogReferenceNotFoundError("product_image");

    await transaction
      .update(productImages)
      .set({ isPrimary: false })
      .where(and(eq(productImages.productId, values.productId), isNull(productImages.variantId)));
    await transaction
      .update(productImages)
      .set({ isPrimary: true })
      .where(eq(productImages.id, values.imageId));
    await transaction.insert(auditLogs).values({
      action: "catalog.image.set_primary",
      actorUserId: actor.userId,
      correlationId,
      outcome: "success",
      reason: values.reason,
      resourceId: values.imageId,
      resourceType: "product_image",
    });
  });
}

export async function reorderProductImage(
  input: z.input<typeof productImageReorderSchema> & {
    actor: StaffPrincipal | null;
    correlationId: string;
  },
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<void> {
  const values = productImageReorderSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const actor = await requireImageManager({
    ...values,
    actor: input.actor,
    correlationId,
    database,
  });

  await database.transaction(async (transaction) => {
    const images = await transaction
      .select({ id: productImages.id, position: productImages.position })
      .from(productImages)
      .where(eq(productImages.productId, values.productId))
      .orderBy(asc(productImages.position), asc(productImages.createdAt))
      .for("update");
    const currentIndex = images.findIndex((image) => image.id === values.imageId);
    if (currentIndex < 0) throw new CatalogReferenceNotFoundError("product_image");
    const targetIndex = values.direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const current = images[currentIndex];
    const target = images[targetIndex];
    if (current === undefined || target === undefined) return;

    await transaction
      .update(productImages)
      .set({ position: target.position })
      .where(eq(productImages.id, current.id));
    await transaction
      .update(productImages)
      .set({ position: current.position })
      .where(eq(productImages.id, target.id));
    await transaction.insert(auditLogs).values({
      action: "catalog.image.reorder",
      actorUserId: actor.userId,
      correlationId,
      metadata: { direction: values.direction },
      outcome: "success",
      reason: values.reason,
      resourceId: values.imageId,
      resourceType: "product_image",
    });
  });
}

export async function deleteProductImage(
  input: z.input<typeof productImageMutationSchema> & {
    actor: StaffPrincipal | null;
    correlationId: string;
  },
  database: ReturnType<typeof getDatabase> = getDatabase(),
  storage?: ProductImageStorage,
): Promise<void> {
  const values = productImageMutationSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const actor = await requireImageManager({
    ...values,
    actor: input.actor,
    correlationId,
    database,
  });
  const [image] = await database
    .select({ isPrimary: productImages.isPrimary, storageKey: productImages.storageKey })
    .from(productImages)
    .where(and(eq(productImages.id, values.imageId), eq(productImages.productId, values.productId)))
    .limit(1);
  if (image === undefined) throw new CatalogReferenceNotFoundError("product_image");

  if (!(await (storage ?? createProductImageStorage()).remove(image.storageKey))) {
    throw new ProductImageMutationError("storage_failed");
  }

  await database.transaction(async (transaction) => {
    await transaction.delete(productImages).where(eq(productImages.id, values.imageId));
    if (image.isPrimary) {
      const [replacement] = await transaction
        .select({ id: productImages.id })
        .from(productImages)
        .where(and(eq(productImages.productId, values.productId), isNull(productImages.variantId)))
        .orderBy(asc(productImages.position), asc(productImages.createdAt))
        .limit(1);
      if (replacement !== undefined) {
        await transaction
          .update(productImages)
          .set({ isPrimary: true })
          .where(eq(productImages.id, replacement.id));
      }
    }
    await transaction.insert(auditLogs).values({
      action: "catalog.image.delete",
      actorUserId: actor.userId,
      correlationId,
      outcome: "success",
      reason: values.reason,
      resourceId: values.imageId,
      resourceType: "product_image",
    });
  });
}
