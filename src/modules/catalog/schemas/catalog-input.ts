import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const optionalPositiveInteger = z.number().int().positive().nullable().optional();

export const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
});

export const createCategorySchema = z.object({
  description: z.string().trim().max(2_000).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  position: z.number().int().nonnegative().max(100_000).default(0),
  slug: slugSchema,
});

export const catalogArchiveSchema = z.object({
  archived: z.boolean(),
  reason: z.string().trim().min(3).max(500),
  resourceId: z.string().uuid(),
});

export const productImageMutationSchema = z.object({
  imageId: z.string().uuid(),
  productId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const productImageReorderSchema = productImageMutationSchema.extend({
  direction: z.enum(["down", "up"]),
});

export const productVariantInputSchema = z.object({
  heightMillimeters: optionalPositiveInteger,
  isActive: z.boolean().default(true),
  lengthMillimeters: optionalPositiveInteger,
  priceOverrideMinor: z.number().int().nonnegative().max(2_000_000_000).nullable().optional(),
  sku: z.string().trim().min(1).max(100),
  stockBehavior: z.enum(["tracked", "untracked"]).default("tracked"),
  title: z.string().trim().min(1).max(160),
  weightGrams: optionalPositiveInteger,
  widthMillimeters: optionalPositiveInteger,
});

export const optionValueInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
});

export const createProductSchema = z.object({
  basePriceMinor: z.number().int().nonnegative().max(2_000_000_000),
  brand: z
    .object({ name: z.string().trim().min(1).max(120), slug: slugSchema })
    .nullable()
    .optional(),
  categories: z
    .array(z.object({ name: z.string().trim().min(1).max(120), slug: slugSchema }))
    .max(20)
    .default([]),
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
  description: z.string().trim().max(20_000).default(""),
  initialQuantity: z.number().int().nonnegative().max(2_000_000_000).default(0),
  lowStockThreshold: z.number().int().nonnegative().max(2_000_000_000).default(0),
  name: z.string().trim().min(1).max(200),
  optionValues: z.array(optionValueInputSchema).max(10).default([]),
  slug: slugSchema,
  status: z.enum(["draft", "active"]).default("draft"),
  variant: productVariantInputSchema,
});

export const addProductVariantSchema = z.object({
  initialQuantity: z.number().int().nonnegative().max(2_000_000_000).default(0),
  lowStockThreshold: z.number().int().nonnegative().max(2_000_000_000).default(0),
  optionValues: z.array(optionValueInputSchema).max(10).default([]),
  productId: z.string().uuid(),
  variant: productVariantInputSchema,
});

export const inventoryAdjustmentSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-2_000_000_000)
    .max(2_000_000_000)
    .refine((value) => value !== 0),
  inventoryItemId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const productStatusChangeSchema = z.object({
  productId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  status: z.enum(["draft", "active", "archived"]),
});

export const updateProductSchema = z.object({
  basePriceMinor: z.number().int().nonnegative().max(2_000_000_000),
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
  description: z.string().trim().max(20_000),
  name: z.string().trim().min(1).max(200),
  productId: z.string().uuid(),
  slug: slugSchema,
  version: z.number().int().positive(),
});

export const updateProductVariantSchema = productVariantInputSchema.extend({
  lowStockThreshold: z.number().int().nonnegative().max(2_000_000_000),
  productId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  variantId: z.string().uuid(),
  version: z.number().int().positive(),
});

export const updateProductOrganizationSchema = z.object({
  brandId: z.string().uuid().nullable(),
  categoryIds: z
    .array(z.string().uuid())
    .max(20)
    .refine((values) => new Set(values).size === values.length),
  productId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export type CreateProductValues = z.output<typeof createProductSchema>;
export type InventoryAdjustmentValues = z.output<typeof inventoryAdjustmentSchema>;
export type ProductStatusChangeValues = z.output<typeof productStatusChangeSchema>;
export type UpdateProductValues = z.output<typeof updateProductSchema>;
export type UpdateProductVariantValues = z.output<typeof updateProductVariantSchema>;
