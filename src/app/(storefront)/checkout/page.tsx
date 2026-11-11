import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";

import { CheckoutForm } from "@/modules/checkout/components/checkout-form";
import { getCurrentCart } from "@/modules/checkout/server/cart-session";
import { listDeliveryOptions } from "@/modules/checkout/server/checkout-service";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await getCurrentCart();
  if (cart === null || cart.lines.length === 0) {
    return (
      <StorefrontMain>
        <section className="py-20 text-center">
          <h1>Your cart is empty</h1>
          <Link className="button-primary inline-flex" href="/products">
            Shop products
          </Link>
        </section>
      </StorefrontMain>
    );
  }
  const currencyCode = cart.lines[0]?.currencyCode ?? "PKR";
  const options = await listDeliveryOptions(currencyCode, cart.subtotalMinor, cart.totalMinor);
  if (options.length === 0) {
    return (
      <StorefrontMain>
        <section className="py-20">
          <h1>Checkout is not available yet</h1>
          <p>No delivery area currently supports this cart. Your items remain saved.</p>
          <Link href="/cart">Return to cart</Link>
        </section>
      </StorefrontMain>
    );
  }
  return (
    <StorefrontMain>
      <div className="py-12">
        <CheckoutForm cart={cart} deliveryOptions={options} idempotencyKey={randomUUID()} />
      </div>
    </StorefrontMain>
  );
}
