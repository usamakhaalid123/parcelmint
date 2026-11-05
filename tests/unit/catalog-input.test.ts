import { describe, expect, it } from "vitest";

import {
  createCategorySchema,
  productImageReorderSchema,
  updateProductVariantSchema,
} from "@/modules/catalog/schemas/catalog-input";

describe("catalog administration input", () => {
  it("accepts hierarchical categories with stable slugs", () => {
    const parentId = "65ea4824-e5cc-4680-a0d1-b1dd31c0b567";
    expect(
      createCategorySchema.parse({
        name: "Running Shoes",
        parentId,
        position: 2,
        slug: "running-shoes",
      }),
    ).toMatchObject({ parentId, position: 2, slug: "running-shoes" });
    expect(() =>
      createCategorySchema.parse({ name: "Bad", position: 0, slug: "Not Stable" }),
    ).toThrow();
  });

  it("requires an audit reason for image ordering changes", () => {
    const base = {
      direction: "up",
      imageId: "fef77a52-759f-4d53-b682-7059de2b8374",
      productId: "11199d45-b0e7-4377-b6d8-c8a64af28f06",
    } as const;
    expect(() => productImageReorderSchema.parse({ ...base, reason: "x" })).toThrow();
    expect(
      productImageReorderSchema.parse({ ...base, reason: "Promote hero image" }),
    ).toMatchObject(base);
  });

  it("validates complete variant updates and their audit reason", () => {
    const input = {
      isActive: true,
      lowStockThreshold: 3,
      productId: "11199d45-b0e7-4377-b6d8-c8a64af28f06",
      reason: "Correct the verified variant details",
      sku: "SHOE-GREEN-42",
      stockBehavior: "tracked",
      title: "Green / 42",
      variantId: "fef77a52-759f-4d53-b682-7059de2b8374",
      version: 2,
    } as const;

    expect(updateProductVariantSchema.parse(input)).toMatchObject(input);
    expect(() => updateProductVariantSchema.parse({ ...input, reason: "x" })).toThrow();
    expect(() => updateProductVariantSchema.parse({ ...input, lowStockThreshold: -1 })).toThrow();
  });
});
