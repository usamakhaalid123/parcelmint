"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import { slugify } from "@/modules/catalog/domain/catalog-values";
import { CatalogConflictError, InventoryAdjustmentError } from "@/modules/catalog/domain/errors";
import { CatalogCsvValidationError } from "@/modules/catalog/domain/catalog-csv";
import {
  addProductVariantSchema,
  createProductSchema,
  inventoryAdjustmentSchema,
  productStatusChangeSchema,
  updateProductSchema,
} from "@/modules/catalog/schemas/catalog-input";
import {
  addProductVariant,
  adjustInventory,
  changeProductStatus,
  createCompleteProduct,
  updateProduct,
} from "@/modules/catalog/server/catalog-service";
import { importCatalogCsv } from "@/modules/catalog/server/catalog-import-service";
import {
  ProductImageUploadError,
  uploadProductImage,
} from "@/modules/catalog/server/product-image-service";

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function requiredNumber(formData: FormData, key: string): number {
  const value = stringValue(formData, key);
  return value === "" ? Number.NaN : Number(value);
}

function optionalNumber(formData: FormData, key: string): number | null {
  const value = stringValue(formData, key);
  return value === "" ? null : Number(value);
}

function safeActionError(error: unknown): string {
  if (error instanceof CatalogConflictError) return `${error.field}_conflict`;
  if (error instanceof InventoryAdjustmentError) return error.reason;
  if (error instanceof z.ZodError) return "invalid_input";
  return "operation_failed";
}

export type CatalogImportState =
  | { status: "idle" }
  | { importedProducts: number; status: "success" }
  | {
      issues: readonly { field: string; message: string; row: number }[];
      message: string;
      status: "error";
    };

export async function importCatalogCsvAction(
  _previousState: CatalogImportState,
  formData: FormData,
): Promise<CatalogImportState> {
  const file = formData.get("catalogFile");
  if (!(file instanceof File) || file.size === 0) {
    return { issues: [], message: "Choose a non-empty CSV file.", status: "error" };
  }
  if (file.size > 2_000_000) {
    return { issues: [], message: "The CSV must be 2 MB or smaller.", status: "error" };
  }

  const correlationId = randomUUID();
  try {
    const result = await importCatalogCsv({
      actor: await getCurrentPrincipal(),
      correlationId,
      csvText: await file.text(),
    });
    revalidatePath("/admin/catalog");
    return { importedProducts: result.importedProducts, status: "success" };
  } catch (error) {
    if (error instanceof CatalogCsvValidationError) {
      return {
        issues: error.issues,
        message: "No products were imported. Correct every listed issue and try again.",
        status: "error",
      };
    }
    logger.warn("Catalog CSV import failed", { correlationId, error });
    return {
      issues: [],
      message: "No products were imported. Check for existing slugs or SKUs and try again.",
      status: "error",
    };
  }
}

export async function createProductAction(formData: FormData): Promise<never> {
  const name = stringValue(formData, "name");
  const categoryName = stringValue(formData, "categoryName");
  const brandName = stringValue(formData, "brandName");
  const optionName = stringValue(formData, "optionName");
  const optionValue = stringValue(formData, "optionValue");
  const correlationId = randomUUID();
  let productId: string;

  try {
    const values = createProductSchema.parse({
      basePriceMinor: requiredNumber(formData, "basePriceMinor"),
      brand:
        brandName === ""
          ? null
          : {
              name: brandName,
              slug: stringValue(formData, "brandSlug") || slugify(brandName),
            },
      categories:
        categoryName === ""
          ? []
          : [
              {
                name: categoryName,
                slug: stringValue(formData, "categorySlug") || slugify(categoryName),
              },
            ],
      currencyCode: stringValue(formData, "currencyCode"),
      description: stringValue(formData, "description"),
      initialQuantity: requiredNumber(formData, "initialQuantity"),
      lowStockThreshold: requiredNumber(formData, "lowStockThreshold"),
      name,
      optionValues:
        optionName === "" || optionValue === "" ? [] : [{ name: optionName, value: optionValue }],
      slug: stringValue(formData, "slug") || slugify(name),
      status: stringValue(formData, "status"),
      variant: {
        heightMillimeters: optionalNumber(formData, "heightMillimeters"),
        isActive: true,
        lengthMillimeters: optionalNumber(formData, "lengthMillimeters"),
        priceOverrideMinor: optionalNumber(formData, "priceOverrideMinor"),
        sku: stringValue(formData, "sku"),
        stockBehavior: stringValue(formData, "stockBehavior"),
        title: stringValue(formData, "variantTitle"),
        weightGrams: optionalNumber(formData, "weightGrams"),
        widthMillimeters: optionalNumber(formData, "widthMillimeters"),
      },
    });
    const created = await createCompleteProduct({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
      inventoryReason: stringValue(formData, "inventoryReason"),
    });
    productId = created.productId;
  } catch (error) {
    logger.warn("Catalog product creation failed", { correlationId, error });
    redirect(`/admin/catalog/new?error=${safeActionError(error)}`);
  }

  revalidatePath("/admin/catalog");
  redirect(`/admin/catalog/${productId}?notice=created`);
}

export async function addVariantAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const optionName = stringValue(formData, "optionName");
  const optionValue = stringValue(formData, "optionValue");
  const correlationId = randomUUID();

  try {
    const values = addProductVariantSchema.parse({
      initialQuantity: requiredNumber(formData, "initialQuantity"),
      lowStockThreshold: requiredNumber(formData, "lowStockThreshold"),
      optionValues:
        optionName === "" || optionValue === "" ? [] : [{ name: optionName, value: optionValue }],
      productId,
      variant: {
        isActive: true,
        priceOverrideMinor: optionalNumber(formData, "priceOverrideMinor"),
        sku: stringValue(formData, "sku"),
        stockBehavior: stringValue(formData, "stockBehavior"),
        title: stringValue(formData, "variantTitle"),
      },
    });
    await addProductVariant({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
      inventoryReason: stringValue(formData, "inventoryReason"),
    });
  } catch (error) {
    logger.warn("Catalog variant creation failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }

  revalidatePath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=variant-created`);
}

export async function adjustInventoryAction(formData: FormData): Promise<never> {
  const productId = z.string().uuid().parse(stringValue(formData, "productId"));
  const correlationId = randomUUID();

  try {
    const values = inventoryAdjustmentSchema.parse({
      delta: requiredNumber(formData, "delta"),
      inventoryItemId: stringValue(formData, "inventoryItemId"),
      reason: stringValue(formData, "reason"),
    });
    await adjustInventory({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Inventory adjustment failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }

  revalidatePath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=stock-adjusted`);
}

export async function changeProductStatusAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();

  try {
    const values = productStatusChangeSchema.parse({
      productId,
      reason: stringValue(formData, "reason"),
      status: stringValue(formData, "status"),
    });
    await changeProductStatus({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Product status change failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=status-updated`);
}

export async function uploadProductImageAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();
  const file = formData.get("imageFile");

  try {
    if (!(file instanceof File)) throw new ProductImageUploadError("invalid_file");
    await uploadProductImage({
      actor: await getCurrentPrincipal(),
      altText: stringValue(formData, "altText"),
      correlationId,
      file,
      isPrimary: formData.get("isPrimary") === "on",
      productId,
    });
  } catch (error) {
    logger.warn("Product image upload failed", { correlationId, error, productId });
    const errorCode = error instanceof ProductImageUploadError ? error.reason : "operation_failed";
    redirect(`/admin/catalog/${productId}?error=${errorCode}`);
  }

  revalidatePath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=image-uploaded`);
}

export async function updateProductAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();

  try {
    const values = updateProductSchema.parse({
      basePriceMinor: requiredNumber(formData, "basePriceMinor"),
      currencyCode: stringValue(formData, "currencyCode"),
      description: stringValue(formData, "description"),
      name: stringValue(formData, "name"),
      productId,
      slug: stringValue(formData, "slug"),
      version: requiredNumber(formData, "version"),
    });
    await updateProduct({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
      reason: stringValue(formData, "reason"),
    });
  } catch (error) {
    logger.warn("Product update failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=product-updated`);
}
