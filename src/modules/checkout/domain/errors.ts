export type CheckoutErrorCode =
  | "cart_empty"
  | "cart_unavailable"
  | "checkout_blocked"
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
