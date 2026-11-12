import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Alert, Button, buttonStyles, Input } from "@/components/ui";
import {
  applyCouponAction,
  clearCouponAction,
  removeCartItemAction,
  updateCartItemAction,
} from "@/modules/checkout/server/actions";
import { getCurrentCart } from "@/modules/checkout/server/cart-session";
import { formatMoney } from "@/modules/storefront/components/product-card";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Cart" };
export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  added: "Item added to your cart.",
  "coupon-applied": "Coupon applied. Final eligibility is checked again at checkout.",
  "coupon-removed": "Coupon removed.",
  removed: "Item removed.",
  updated: "Cart updated.",
};

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const [cart, query] = await Promise.all([getCurrentCart(), searchParams]);
  const lines = cart?.lines ?? [];
  const currencyCode = lines[0]?.currencyCode ?? "PKR";

  return (
    <StorefrontMain>
      <div className="py-12">
        <p className="eyebrow">Your selection</p>
        <h1>Shopping cart</h1>
        {query.notice !== undefined && messages[query.notice] !== undefined ? (
          <Alert tone="success">{messages[query.notice]}</Alert>
        ) : null}
        {query.error !== undefined ? (
          <Alert tone="error">
            We could not update the cart. Check availability and try again.
          </Alert>
        ) : null}

        {cart === null || lines.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-[var(--border)] bg-surface p-12 text-center">
            <h2>Your cart is empty</h2>
            <p className="text-[var(--muted)]">Browse the catalog to find something you like.</p>
            <Link className={buttonStyles.primary} href="/products">
              Shop products
            </Link>
          </section>
        ) : (
          <div className="grid grid-cols-[1fr_22rem] gap-10 max-lg:grid-cols-1">
            <section aria-label="Cart items" className="grid gap-4">
              {lines.map((line) => {
                const unavailable =
                  line.availableQuantity !== null && line.quantity > line.availableQuantity;
                return (
                  <article
                    className="grid grid-cols-[7rem_1fr_auto] gap-5 rounded-2xl border border-[var(--border)] bg-white p-4 max-sm:grid-cols-[5rem_1fr]"
                    key={line.cartItemId}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                      {line.image === null ? null : (
                        <Image
                          alt={line.image.altText}
                          className="object-cover"
                          fill
                          sizes="112px"
                          src={`/api/v1/storefront/images/${line.image.id}`}
                        />
                      )}
                    </div>
                    <div>
                      <h2 className="mt-0 text-xl">
                        <Link href={`/products/${line.productSlug}`}>{line.productName}</Link>
                      </h2>
                      <p className="text-sm text-[var(--muted)]">
                        {line.variantTitle} · {line.sku}
                      </p>
                      <strong>{formatMoney(line.unitPriceMinor, line.currencyCode)}</strong>
                      {unavailable ? (
                        <p className="text-sm font-bold text-red-700" role="alert">
                          Only {line.availableQuantity} currently available.
                        </p>
                      ) : null}
                    </div>
                    <div className="grid content-start gap-2 max-sm:col-span-2 max-sm:grid-cols-2">
                      <form action={updateCartItemAction} className="flex gap-2">
                        <input name="cartItemId" type="hidden" value={line.cartItemId} />
                        <label className="sr-only" htmlFor={`quantity-${line.cartItemId}`}>
                          Quantity for {line.productName}
                        </label>
                        <Input
                          className="w-20"
                          defaultValue={line.quantity}
                          id={`quantity-${line.cartItemId}`}
                          max={99}
                          min={1}
                          name="quantity"
                          type="number"
                        />
                        <Button type="submit" variant="secondary">
                          Update
                        </Button>
                      </form>
                      <form action={removeCartItemAction}>
                        <input name="cartItemId" type="hidden" value={line.cartItemId} />
                        <Button className="w-full" type="submit" variant="secondary">
                          Remove
                        </Button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="h-fit rounded-2xl border border-[var(--border)] bg-surface p-6">
              <h2 className="mt-0 text-xl">Summary</h2>
              <dl className="grid gap-3">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(cart.subtotalMinor, currencyCode)}</dd>
                </div>
                {cart.discountMinor > 0 ? (
                  <div className="flex justify-between text-emerald-800">
                    <dt>Discount</dt>
                    <dd>−{formatMoney(cart.discountMinor, currencyCode)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-[var(--border)] pt-3 font-black">
                  <dt>Before delivery</dt>
                  <dd>{formatMoney(cart.totalMinor, currencyCode)}</dd>
                </div>
              </dl>
              <p className="text-sm text-[var(--muted)]">
                Delivery is calculated from your selected area at checkout.
              </p>
              {cart.couponCode === null ? (
                <form action={applyCouponAction} className="my-5 grid gap-2">
                  <label className="font-bold" htmlFor="couponCode">
                    Coupon
                  </label>
                  <div className="flex gap-2">
                    <Input className="min-w-0" id="couponCode" maxLength={40} name="couponCode" />
                    <Button type="submit" variant="secondary">
                      Apply
                    </Button>
                  </div>
                </form>
              ) : (
                <form action={clearCouponAction} className="my-5 rounded-xl bg-white p-3">
                  <p className="mt-0 text-sm">
                    Coupon: <strong>{cart.couponCode}</strong>
                  </p>
                  <Button type="submit" variant="secondary">
                    Remove coupon
                  </Button>
                </form>
              )}
              <Link className={buttonStyles.primary} href="/checkout">
                Continue to checkout
              </Link>
            </aside>
          </div>
        )}
      </div>
    </StorefrontMain>
  );
}
