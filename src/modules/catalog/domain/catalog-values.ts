export type InventoryAvailability = "in_stock" | "low_stock" | "out_of_stock" | "untracked";

export function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveInventoryAvailability(input: {
  isActive: boolean;
  lowStockThreshold: number;
  onHandQuantity: number;
  reservedQuantity: number;
  stockBehavior: "tracked" | "untracked";
}): InventoryAvailability {
  if (!input.isActive) {
    return "out_of_stock";
  }

  if (input.stockBehavior === "untracked") {
    return "untracked";
  }

  const availableQuantity = input.onHandQuantity - input.reservedQuantity;

  if (availableQuantity <= 0) {
    return "out_of_stock";
  }

  if (availableQuantity <= input.lowStockThreshold) {
    return "low_stock";
  }

  return "in_stock";
}
