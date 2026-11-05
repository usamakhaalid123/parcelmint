"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import { slugify } from "@/modules/catalog/domain/catalog-values";
import {
  CatalogConcurrentModificationError,
  CatalogConflictError,
  InventoryAdjustmentError,
} from "@/modules/catalog/domain/errors";
import { CatalogCsvValidationError } from "@/modules/catalog/domain/catalog-csv";
import {
  catalogArchiveSchema,
  addProductVariantSchema,
  createBrandSchema,
  createCategorySchema,
  createProductSchema,
  inventoryAdjustmentSchema,
  productStatusChangeSchema,
  productImageMutationSchema,
  productImageReorderSchema,
  updateProductSchema,
  updateProductOrganizationSchema,
  updateProductVariantSchema,
} from "@/modules/catalog/schemas/catalog-input";
import {
  addProductVariant,
  adjustInventory,
  changeProductStatus,
  createCompleteProduct,
  updateProduct,
  updateProductOrganization,
  updateProductVariant,
} from "@/modules/catalog/server/catalog-service";
import { importCatalogCsv } from "@/modules/catalog/server/catalog-import-service";
import {
  createBrand,
  createCategory,
  setBrandArchived,
  setCategoryArchived,
} from "@/modules/catalog/server/catalog-organization-service";
import {
  deleteProductImage,
  ProductImageUploadError,
  ProductImageMutationError,
  reorderProductImage,
  setPrimaryProductImage,
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
  if (error instanceof CatalogConcurrentModificationError) return "concurrent_modification";
  if (error instanceof InventoryAdjustmentError) return error.reason;
  if (error instanceof z.ZodError) return "invalid_input";
  return "operation_failed";
}

function revalidateCatalogPath(path: string): void {
  revalidatePath(path);
  revalidateTag("storefront-catalog", "max");
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
    revalidateCatalogPath("/admin/catalog");
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

  revalidateCatalogPath("/admin/catalog");
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

  revalidateCatalogPath(`/admin/catalog/${productId}`);
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

  revalidateCatalogPath(`/admin/catalog/${productId}`);
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

  revalidateCatalogPath("/admin/catalog");
  revalidateCatalogPath(`/admin/catalog/${productId}`);
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

  revalidateCatalogPath(`/admin/catalog/${productId}`);
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

  revalidateCatalogPath("/admin/catalog");
  revalidateCatalogPath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=product-updated`);
}

export async function updateProductVariantAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();
  try {
    const values = updateProductVariantSchema.parse({
      heightMillimeters: optionalNumber(formData, "heightMillimeters"),
      isActive: formData.get("isActive") === "on",
      lengthMillimeters: optionalNumber(formData, "lengthMillimeters"),
      lowStockThreshold: requiredNumber(formData, "lowStockThreshold"),
      priceOverrideMinor: optionalNumber(formData, "priceOverrideMinor"),
      productId,
      reason: stringValue(formData, "reason"),
      sku: stringValue(formData, "sku"),
      stockBehavior: stringValue(formData, "stockBehavior"),
      title: stringValue(formData, "variantTitle"),
      variantId: stringValue(formData, "variantId"),
      version: requiredNumber(formData, "version"),
      weightGrams: optionalNumber(formData, "weightGrams"),
      widthMillimeters: optionalNumber(formData, "widthMillimeters"),
    });
    await updateProductVariant({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Catalog variant update failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }

  revalidateCatalogPath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=variant-updated`);
}

export async function updateProductOrganizationAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();
  try {
    const brandId = stringValue(formData, "brandId");
    const values = updateProductOrganizationSchema.parse({
      brandId: brandId === "" ? null : brandId,
      categoryIds: formData
        .getAll("categoryIds")
        .filter((value): value is string => typeof value === "string"),
      productId,
      reason: stringValue(formData, "reason"),
    });
    await updateProductOrganization({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Product organization update failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }
  revalidateCatalogPath("/admin/catalog");
  revalidateCatalogPath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=product-organization-updated`);
}

export async function createBrandAction(formData: FormData): Promise<never> {
  const correlationId = randomUUID();
  try {
    const name = stringValue(formData, "name");
    const values = createBrandSchema.parse({
      name,
      slug: stringValue(formData, "slug") || slugify(name),
    });
    await createBrand({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Catalog brand creation failed", { correlationId, error });
    redirect(`/admin/catalog/organization?error=${safeActionError(error)}`);
  }
  revalidateCatalogPath("/admin/catalog/organization");
  redirect("/admin/catalog/organization?notice=brand-created");
}

export async function createCategoryAction(formData: FormData): Promise<never> {
  const correlationId = randomUUID();
  try {
    const name = stringValue(formData, "name");
    const parentId = stringValue(formData, "parentId");
    const values = createCategorySchema.parse({
      description: stringValue(formData, "description") || null,
      name,
      parentId: parentId === "" ? null : parentId,
      position: requiredNumber(formData, "position"),
      slug: stringValue(formData, "slug") || slugify(name),
    });
    await createCategory({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Catalog category creation failed", { correlationId, error });
    redirect(`/admin/catalog/organization?error=${safeActionError(error)}`);
  }
  revalidateCatalogPath("/admin/catalog/organization");
  redirect("/admin/catalog/organization?notice=category-created");
}

async function changeOrganizationArchiveState(
  formData: FormData,
  resourceType: "brand" | "category",
): Promise<never> {
  const correlationId = randomUUID();
  try {
    const values = catalogArchiveSchema.parse({
      archived: stringValue(formData, "archived") === "true",
      reason: stringValue(formData, "reason"),
      resourceId: stringValue(formData, "resourceId"),
    });
    const input = { ...values, actor: await getCurrentPrincipal(), correlationId };
    if (resourceType === "brand") await setBrandArchived(input);
    else await setCategoryArchived(input);
  } catch (error) {
    logger.warn("Catalog organization archive change failed", {
      correlationId,
      error,
      resourceType,
    });
    redirect(`/admin/catalog/organization?error=${safeActionError(error)}`);
  }
  revalidateCatalogPath("/admin/catalog/organization");
  redirect(`/admin/catalog/organization?notice=${resourceType}-updated`);
}

export async function setBrandArchivedAction(formData: FormData): Promise<never> {
  return changeOrganizationArchiveState(formData, "brand");
}

export async function setCategoryArchivedAction(formData: FormData): Promise<never> {
  return changeOrganizationArchiveState(formData, "category");
}

function productImageValues(formData: FormData) {
  return productImageMutationSchema.parse({
    imageId: stringValue(formData, "imageId"),
    productId: stringValue(formData, "productId"),
    reason: stringValue(formData, "reason"),
  });
}

export async function setPrimaryProductImageAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();
  try {
    await setPrimaryProductImage({
      ...productImageValues(formData),
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Set primary product image failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }
  revalidateCatalogPath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=image-primary-updated`);
}

export async function reorderProductImageAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();
  try {
    const values = productImageReorderSchema.parse({
      ...productImageValues(formData),
      direction: stringValue(formData, "direction"),
    });
    await reorderProductImage({
      ...values,
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Product image reorder failed", { correlationId, error, productId });
    redirect(`/admin/catalog/${productId}?error=${safeActionError(error)}`);
  }
  revalidateCatalogPath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=image-reordered`);
}

export async function deleteProductImageAction(formData: FormData): Promise<never> {
  const productId = stringValue(formData, "productId");
  const correlationId = randomUUID();
  try {
    await deleteProductImage({
      ...productImageValues(formData),
      actor: await getCurrentPrincipal(),
      correlationId,
    });
  } catch (error) {
    logger.warn("Product image deletion failed", { correlationId, error, productId });
    const errorCode =
      error instanceof ProductImageMutationError ? error.reason : safeActionError(error);
    redirect(`/admin/catalog/${productId}?error=${errorCode}`);
  }
  revalidateCatalogPath(`/admin/catalog/${productId}`);
  redirect(`/admin/catalog/${productId}?notice=image-deleted`);
}
