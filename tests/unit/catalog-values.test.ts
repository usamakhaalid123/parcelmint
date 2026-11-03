import { describe, expect, it } from "vitest";

import {
  deriveInventoryAvailability,
  normalizeSku,
  slugify,
} from "@/modules/catalog/domain/catalog-values";

describe("catalog values", () => {
  it("normalizes SKUs without losing meaningful punctuation", () => {
    expect(normalizeSku("  shirt-blue.m  ")).toBe("SHIRT-BLUE.M");
  });

  it("creates stable URL slugs", () => {
    expect(slugify("  Café & Travel Mug  ")).toBe("cafe-travel-mug");
  });

  it("derives tracked availability from on-hand minus reserved stock", () => {
    expect(
      deriveInventoryAvailability({
        isActive: true,
        lowStockThreshold: 2,
        onHandQuantity: 5,
        reservedQuantity: 3,
        stockBehavior: "tracked",
      }),
    ).toBe("low_stock");
    expect(
      deriveInventoryAvailability({
        isActive: true,
        lowStockThreshold: 2,
        onHandQuantity: 5,
        reservedQuantity: 5,
        stockBehavior: "tracked",
      }),
    ).toBe("out_of_stock");
  });

  it("keeps untracked and inactive availability distinct", () => {
    expect(
      deriveInventoryAvailability({
        isActive: true,
        lowStockThreshold: 0,
        onHandQuantity: 0,
        reservedQuantity: 0,
        stockBehavior: "untracked",
      }),
    ).toBe("untracked");
    expect(
      deriveInventoryAvailability({
        isActive: false,
        lowStockThreshold: 0,
        onHandQuantity: 10,
        reservedQuantity: 0,
        stockBehavior: "tracked",
      }),
    ).toBe("out_of_stock");
  });
});
