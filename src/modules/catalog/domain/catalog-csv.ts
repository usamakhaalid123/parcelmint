import { z } from "zod";

import { slugify } from "./catalog-values";
import { createProductSchema, type CreateProductValues } from "../schemas/catalog-input";

export const catalogCsvHeaders = [
  "name",
  "slug",
  "description",
  "status",
  "currency_code",
  "base_price_minor",
  "brand_name",
  "brand_slug",
  "category_name",
  "category_slug",
  "variant_title",
  "sku",
  "price_override_minor",
  "stock_behavior",
  "initial_quantity",
  "low_stock_threshold",
  "option_name",
  "option_value",
  "inventory_reason",
] as const;

export type CatalogCsvIssue = {
  field: string;
  message: string;
  row: number;
};

export class CatalogCsvValidationError extends Error {
  constructor(readonly issues: readonly CatalogCsvIssue[]) {
    super("The catalog CSV contains invalid rows.");
    this.name = "CatalogCsvValidationError";
  }
}

export type CatalogCsvRow = {
  inventoryReason: string;
  product: CreateProductValues;
  rowNumber: number;
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  if (quoted) {
    throw new CatalogCsvValidationError([
      { field: "file", message: "Unclosed quoted value", row: 1 },
    ]);
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parseInteger(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function parseOptionalInteger(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function parseCatalogCsv(text: string): CatalogCsvRow[] {
  const rows = parseCsv(text);
  const header = rows[0]?.map((value) => value.trim().toLowerCase());
  if (
    header === undefined ||
    header.length !== catalogCsvHeaders.length ||
    header.some((value, index) => value !== catalogCsvHeaders[index])
  ) {
    throw new CatalogCsvValidationError([
      { field: "header", message: "The CSV header does not match the catalog template", row: 1 },
    ]);
  }

  const parsedRows: CatalogCsvRow[] = [];
  const issues: CatalogCsvIssue[] = [];
  const seenSlugs = new Set<string>();
  const seenSkus = new Set<string>();

  for (const [rowIndex, cells] of rows.slice(1).entries()) {
    const rowNumber = rowIndex + 2;
    if (cells.length !== catalogCsvHeaders.length) {
      issues.push({ field: "row", message: "Incorrect number of columns", row: rowNumber });
      continue;
    }

    const cell = (name: (typeof catalogCsvHeaders)[number]) =>
      cells[catalogCsvHeaders.indexOf(name)]?.trim() ?? "";
    const brandName = cell("brand_name");
    const categoryName = cell("category_name");
    const optionName = cell("option_name");
    const optionValue = cell("option_value");
    const candidate = createProductSchema.safeParse({
      basePriceMinor: parseInteger(cell("base_price_minor")),
      brand:
        brandName === ""
          ? null
          : { name: brandName, slug: cell("brand_slug") || slugify(brandName) },
      categories:
        categoryName === ""
          ? []
          : [{ name: categoryName, slug: cell("category_slug") || slugify(categoryName) }],
      currencyCode: cell("currency_code"),
      description: cell("description"),
      initialQuantity: parseInteger(cell("initial_quantity")),
      lowStockThreshold: parseInteger(cell("low_stock_threshold")),
      name: cell("name"),
      optionValues:
        optionName === "" || optionValue === "" ? [] : [{ name: optionName, value: optionValue }],
      slug: cell("slug"),
      status: cell("status"),
      variant: {
        isActive: true,
        priceOverrideMinor: parseOptionalInteger(cell("price_override_minor")),
        sku: cell("sku"),
        stockBehavior: cell("stock_behavior"),
        title: cell("variant_title"),
      },
    });
    const inventoryReason = z.string().trim().min(3).max(500).safeParse(cell("inventory_reason"));

    if (!candidate.success) {
      for (const issue of candidate.error.issues) {
        issues.push({ field: issue.path.join("."), message: issue.message, row: rowNumber });
      }
    }
    if (!inventoryReason.success) {
      issues.push({
        field: "inventory_reason",
        message: "Must contain 3–500 characters",
        row: rowNumber,
      });
    }
    if (!candidate.success || !inventoryReason.success) continue;

    if (seenSlugs.has(candidate.data.slug)) {
      issues.push({ field: "slug", message: "Duplicate slug in file", row: rowNumber });
    }
    const normalizedSku = candidate.data.variant.sku.trim().toUpperCase();
    if (seenSkus.has(normalizedSku)) {
      issues.push({ field: "sku", message: "Duplicate normalized SKU in file", row: rowNumber });
    }
    seenSlugs.add(candidate.data.slug);
    seenSkus.add(normalizedSku);
    parsedRows.push({
      inventoryReason: inventoryReason.data,
      product: candidate.data,
      rowNumber,
    });
  }

  if (parsedRows.length === 0 && issues.length === 0) {
    issues.push({ field: "file", message: "The CSV does not contain product rows", row: 1 });
  }
  if (issues.length > 0) throw new CatalogCsvValidationError(issues);
  return parsedRows;
}

function escapeCsvValue(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n")}\r\n`;
}
