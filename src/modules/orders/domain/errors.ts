export class OrderAuthorizationError extends Error {
  constructor() {
    super("Order operation is not authorized");
    this.name = "OrderAuthorizationError";
  }
}

export class OrderNotFoundError extends Error {
  constructor() {
    super("Order was not found");
    this.name = "OrderNotFoundError";
  }
}

export class OrderTransitionError extends Error {
  constructor(
    readonly code: "invalid_transition" | "reservation_unavailable" | "shipment_required",
  ) {
    super(code);
    this.name = "OrderTransitionError";
  }
}

export class OrderBlockedError extends Error {
  constructor() {
    super("Checkout is blocked by an operational control");
    this.name = "OrderBlockedError";
  }
}
