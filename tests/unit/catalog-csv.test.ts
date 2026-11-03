import { describe, expect, it } from "vitest";

import {
  catalogCsvHeaders,
  CatalogCsvValidationError,
  parseCatalogCsv,
  parseCsv,
  serializeCsv,
} from "@/modules/catalog/domain/catalog-csv";

describe("catalog CSV", () => {
  it("parses quoted commas, escaped quotes, and newlines", () => {
    expect(parseCsv('name,description\r\n"Mug, Large","A ""great"" mug"\r\n')).toEqual([
      ["name", "description"],
      ["Mug, Large", 'A "great" mug'],
    ]);
  });

  it("validates the full catalog row and normalizes currency", () => {
    const text = serializeCsv([
      catalogCsvHeaders,
      [
        "Travel Mug",
        "travel-mug",
        "Steel mug",
        "draft",
        "pkr",
        2500,
        "Acme",
        "acme",
        "Drinkware",
        "drinkware",
        "Green",
        "MUG-GREEN",
        null,
        "tracked",
        5,
        2,
        "Color",
        "Green",
        "Opening warehouse count",
      ],
    ]);

    const [row] = parseCatalogCsv(text);
    expect(row?.product.currencyCode).toBe("PKR");
    expect(row?.product.initialQuantity).toBe(5);
    expect(row?.product.optionValues).toEqual([{ name: "Color", value: "Green" }]);
  });

  it("reports every invalid row before import", () => {
    const text = serializeCsv([
      catalogCsvHeaders,
      [
        "Bad product",
        "INVALID SLUG",
        "",
        "draft",
        "PKR",
        -1,
        "",
        "",
        "",
        "",
        "Default",
        "",
        null,
        "tracked",
        0,
        0,
        "",
        "",
        "x",
      ],
    ]);

    expect(() => parseCatalogCsv(text)).toThrow(CatalogCsvValidationError);
    try {
      parseCatalogCsv(text);
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogCsvValidationError);
      if (error instanceof CatalogCsvValidationError) {
        expect(error.issues.map((issue) => issue.field)).toEqual(
          expect.arrayContaining(["slug", "basePriceMinor", "variant.sku", "inventory_reason"]),
        );
      }
    }
  });

  it("rejects duplicate normalized SKUs without partially accepting the file", () => {
    const baseRow = [
      "Product One",
      "product-one",
      "",
      "draft",
      "PKR",
      100,
      "",
      "",
      "",
      "",
      "Default",
      "sku-one",
      null,
      "tracked",
      0,
      0,
      "",
      "",
      "CSV import",
    ] as const;
    const text = serializeCsv([
      catalogCsvHeaders,
      baseRow,
      ["Product Two", "product-two", ...baseRow.slice(2, 11), " SKU-ONE ", ...baseRow.slice(12)],
    ]);

    expect(() => parseCatalogCsv(text)).toThrow(CatalogCsvValidationError);
  });
});
