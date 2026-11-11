"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { formatMoney } from "@/modules/storefront/components/product-card";
import type { CartView } from "@/modules/checkout/server/cart-repository";
import type { DeliveryOption } from "@/modules/checkout/server/checkout-service";
import { submitCheckoutAction, type CheckoutActionState } from "@/modules/checkout/server/actions";

function SubmitOrderButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button-primary w-full" disabled={pending} type="submit">
      {pending ? "Submitting securely…" : "Place cash-on-delivery order"}
    </button>
  );
}

export function CheckoutForm({
  cart,
  deliveryOptions,
  idempotencyKey,
}: {
  cart: CartView;
  deliveryOptions: readonly DeliveryOption[];
  idempotencyKey: string;
}) {
  const initialState: CheckoutActionState = { status: "idle" };
  const [state, action] = useActionState(submitCheckoutAction, initialState);
  const [deliveryZoneId, setDeliveryZoneId] = useState(deliveryOptions[0]?.id ?? "");
  const selectedDelivery =
    deliveryOptions.find(({ id }) => id === deliveryZoneId) ?? deliveryOptions[0];
  const currencyCode = cart.lines[0]?.currencyCode ?? "PKR";
  const grandTotal = cart.totalMinor + (selectedDelivery?.feeMinor ?? 0);

  return (
    <form action={action} className="grid grid-cols-[1fr_22rem] gap-10 max-lg:grid-cols-1">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <section aria-labelledby="delivery-details-heading" className="space-y-6">
        <div>
          <p className="eyebrow">Guest checkout</p>
          <h1 id="delivery-details-heading">Delivery details</h1>
          <p className="text-[var(--muted)]">
            No account is required. We will use these details only to verify and deliver this order.
          </p>
        </div>
        {state.status === "error" ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900" role="alert">
            {state.message}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
          <label className="grid gap-2 font-bold">
            Full name
            <input autoComplete="name" maxLength={120} name="customerName" required />
          </label>
          <label className="grid gap-2 font-bold">
            Mobile number
            <input autoComplete="tel" inputMode="tel" name="mobileNumber" required />
          </label>
          <label className="grid gap-2 font-bold">
            Email <span className="font-normal text-[var(--muted)]">(optional)</span>
            <input autoComplete="email" maxLength={254} name="email" type="email" />
          </label>
          <label className="grid gap-2 font-bold">
            Delivery area
            <select
              name="deliveryZoneId"
              onChange={(event) => setDeliveryZoneId(event.target.value)}
              required
              value={deliveryZoneId}
            >
              {deliveryOptions.map((option) => (
                <option key={`${option.id}-${option.name}`} value={option.id}>
                  {option.zoneName} — {formatMoney(option.feeMinor, currencyCode)} (
                  {option.estimatedDaysMin}–{option.estimatedDaysMax} days)
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-2 font-bold">
          Complete delivery address
          <textarea
            autoComplete="street-address"
            maxLength={500}
            name="addressLine"
            required
            rows={4}
          />
        </label>
        <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
          <label className="grid gap-2 font-bold">
            Landmark <span className="font-normal text-[var(--muted)]">(optional)</span>
            <input maxLength={500} name="landmark" />
          </label>
          <label className="grid gap-2 font-bold">
            Postal code <span className="font-normal text-[var(--muted)]">(optional)</span>
            <input autoComplete="postal-code" maxLength={24} name="postalCode" />
          </label>
        </div>
        <label className="grid gap-2 font-bold">
          Delivery instructions <span className="font-normal text-[var(--muted)]">(optional)</span>
          <textarea maxLength={500} name="deliveryInstructions" rows={3} />
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
          <input className="mt-1 h-5 w-5" name="policyConsent" required type="checkbox" />
          <span>
            I agree to the <Link href="/content/terms">terms</Link>,{" "}
            <Link href="/content/privacy">privacy notice</Link>, and cash-on-delivery conditions.
          </span>
        </label>
      </section>

      <aside className="h-fit rounded-2xl border border-[var(--border)] bg-surface p-6 lg:sticky lg:top-6">
        <h2 className="mt-0 text-xl">Order summary</h2>
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Items ({cart.itemCount})</dt>
            <dd>{formatMoney(cart.subtotalMinor, currencyCode)}</dd>
          </div>
          {cart.discountMinor > 0 ? (
            <div className="flex justify-between gap-4 text-emerald-800">
              <dt>Discount</dt>
              <dd>−{formatMoney(cart.discountMinor, currencyCode)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt>Delivery</dt>
            <dd>{formatMoney(selectedDelivery?.feeMinor ?? 0, currencyCode)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-3 text-lg font-black">
            <dt>Total</dt>
            <dd>{formatMoney(grandTotal, currencyCode)}</dd>
          </div>
        </dl>
        <p className="my-5 rounded-xl bg-white p-4 text-sm text-[var(--muted)]">
          Payment is collected on delivery. Your order remains pending until COD verification is
          completed.
        </p>
        <SubmitOrderButton />
      </aside>
    </form>
  );
}
