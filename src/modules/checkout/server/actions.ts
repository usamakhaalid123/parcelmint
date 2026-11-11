"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { CheckoutError } from "@/modules/checkout/domain/errors";
import {
  cartItemInputSchema,
  checkoutInputSchema,
} from "@/modules/checkout/schemas/checkout-input";
import {
  addCartItem,
  applyCartCoupon,
  clearCartCoupon,
  removeCartItem,
  updateCartItem,
} from "@/modules/checkout/server/cart-repository";
import {
  clearCartSession,
  getCurrentCart,
  requireMutableCart,
} from "@/modules/checkout/server/cart-session";
import { createOrderFromCart } from "@/modules/checkout/server/checkout-service";
import { consumeRateLimit } from "@/modules/checkout/server/rate-limit";

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export type AddToCartActionState = { status: "idle" | "success" } | { status: "error" };

export async function addToCartAction(
  _previousState: AddToCartActionState,
  formData: FormData,
): Promise<AddToCartActionState> {
  try {
    const input = cartItemInputSchema.parse({
      quantity: stringValue(formData, "quantity") || "1",
      variantId: stringValue(formData, "variantId"),
    });
    const cart = await requireMutableCart();
    await addCartItem(cart.id, input.variantId, input.quantity);
  } catch {
    return { status: "error" };
  }
  return { status: "success" };
}

export async function updateCartItemAction(formData: FormData): Promise<never> {
  const cart = await getCurrentCart();
  if (cart === null) redirect("/cart?error=cart_unavailable");
  try {
    const quantity = z.coerce
      .number()
      .int()
      .min(1)
      .max(99)
      .parse(stringValue(formData, "quantity"));
    const cartItemId = z.string().uuid().parse(stringValue(formData, "cartItemId"));
    await updateCartItem(cart.id, cartItemId, quantity);
  } catch {
    redirect("/cart?error=invalid_input");
  }
  redirect("/cart?notice=updated");
}

export async function removeCartItemAction(formData: FormData): Promise<never> {
  const cart = await getCurrentCart();
  if (cart !== null) {
    const cartItemId = z.string().uuid().safeParse(stringValue(formData, "cartItemId"));
    if (cartItemId.success) await removeCartItem(cart.id, cartItemId.data);
  }
  redirect("/cart?notice=removed");
}

export async function applyCouponAction(formData: FormData): Promise<never> {
  const cart = await getCurrentCart();
  if (cart === null) redirect("/cart?error=cart_empty");
  try {
    const code = z.string().trim().min(1).max(40).parse(stringValue(formData, "couponCode"));
    await applyCartCoupon(cart.id, code);
  } catch {
    redirect("/cart?error=coupon_invalid");
  }
  redirect("/cart?notice=coupon-applied");
}

export async function clearCouponAction(): Promise<never> {
  const cart = await getCurrentCart();
  if (cart !== null) await clearCartCoupon(cart.id);
  redirect("/cart?notice=coupon-removed");
}

export type CheckoutActionState = { status: "idle" } | { message: string; status: "error" };

const checkoutMessages: Record<string, string> = {
  cart_empty: "Your cart is empty.",
  cart_unavailable: "One or more cart items are no longer available.",
  coupon_invalid: "The coupon is no longer valid. Review your cart and try again.",
  delivery_unsupported: "The selected delivery area is not available for this order.",
  idempotency_conflict: "This checkout request was already used with different details.",
  mixed_currency: "The cart contains incompatible currencies.",
  stock_unavailable: "Stock changed before checkout. Review your cart and try again.",
};

export async function submitCheckoutAction(
  _previousState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const correlationId = randomUUID();
  const cart = await getCurrentCart();
  if (cart === null || cart.lines.length === 0) {
    return { message: checkoutMessages.cart_empty ?? "Your cart is empty.", status: "error" };
  }

  let orderId: string;
  try {
    const input = checkoutInputSchema.parse({
      addressLine: stringValue(formData, "addressLine"),
      customerName: stringValue(formData, "customerName"),
      deliveryInstructions: stringValue(formData, "deliveryInstructions"),
      deliveryZoneId: stringValue(formData, "deliveryZoneId"),
      email: stringValue(formData, "email"),
      idempotencyKey: stringValue(formData, "idempotencyKey"),
      landmark: stringValue(formData, "landmark"),
      mobileNumber: stringValue(formData, "mobileNumber"),
      policyConsent: stringValue(formData, "policyConsent"),
      postalCode: stringValue(formData, "postalCode"),
    });
    const allowed = await consumeRateLimit("checkout", cart.id, 10, 10 * 60 * 1000);
    if (!allowed) {
      return {
        message: "Too many checkout attempts. Wait a few minutes and try again.",
        status: "error",
      };
    }
    const order = await createOrderFromCart(cart.id, input);
    orderId = order.orderId;
  } catch (error) {
    const code = error instanceof CheckoutError ? error.code : "invalid_input";
    logger.warn("Checkout submission rejected", { code, correlationId });
    return {
      message:
        checkoutMessages[code] ?? "Check the required checkout details and submit the order again.",
      status: "error",
    };
  }

  await clearCartSession();
  redirect(`/checkout/confirmation/${orderId}`);
}
