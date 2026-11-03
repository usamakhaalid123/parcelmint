export class CatalogAuthorizationError extends Error {
  constructor() {
    super("You do not have permission to perform this catalog operation.");
    this.name = "CatalogAuthorizationError";
  }
}

export class CatalogConflictError extends Error {
  constructor(readonly field: "sku" | "slug") {
    super(`A catalog record already uses this ${field}.`);
    this.name = "CatalogConflictError";
  }
}

export class CatalogReferenceNotFoundError extends Error {
  constructor(readonly resource: "inventory_item" | "product" | "product_image") {
    super(`The requested ${resource} does not exist.`);
    this.name = "CatalogReferenceNotFoundError";
  }
}

export class InventoryAdjustmentError extends Error {
  constructor(
    readonly reason: "insufficient_on_hand" | "reserved_quantity_conflict" | "untracked_variant",
  ) {
    super("The inventory adjustment could not be applied.");
    this.name = "InventoryAdjustmentError";
  }
}

export class CatalogConcurrentModificationError extends Error {
  constructor() {
    super("The catalog record changed while it was being edited.");
    this.name = "CatalogConcurrentModificationError";
  }
}
