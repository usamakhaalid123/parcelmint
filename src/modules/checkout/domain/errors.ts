export type CheckoutErrorCode =
  | "cart_empty"
  | "cart_unavailable"
  | "coupon_invalid"
  | "delivery_unsupported"
  | "idempotency_conflict"
  | "mixed_currency"
  | "stock_unavailable";

export class CheckoutError extends Error {
  constructor(readonly code: CheckoutErrorCode) {
    super(code);
    this.name = "CheckoutError";
  }
}
