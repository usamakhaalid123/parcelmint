import { describe, expect, it } from "vitest";

import { formatMoney, minorUnitsToMajor } from "@/modules/storefront/components/product-card";
import { parseStorefrontCatalogQuery } from "@/modules/storefront/schemas/catalog-query";

describe("storefront values", () => {
  it("validates and normalizes catalog query parameters", () => {
    expect(
      parseStorefrontCatalogQuery({
        maxPrice: "5000",
        minPrice: "1000",
        page: "2",
        query: "  green shoe  ",
        sort: "price_asc",
      }),
    ).toMatchObject({ maxPrice: 5000, minPrice: 1000, page: 2, query: "green shoe" });
    expect(() => parseStorefrontCatalogQuery({ maxPrice: "1", minPrice: "2" })).toThrow();
    expect(() => parseStorefrontCatalogQuery({ page: "not-a-number" })).toThrow();
  });

  it("formats minor units using the currency's configured precision", () => {
    expect(minorUnitsToMajor(12_500, "PKR")).toBe(125);
    expect(formatMoney(12_500, "PKR")).toContain("125");
    expect(minorUnitsToMajor(500, "JPY")).toBe(500);
  });
});
