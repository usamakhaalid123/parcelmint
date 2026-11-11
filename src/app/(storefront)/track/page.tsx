import type { Metadata } from "next";

import { requestTrackingCodeAction } from "@/modules/orders/server/tracking-actions";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Track order" };

export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return (
    <StorefrontMain>
      <section className="mx-auto max-w-xl py-16">
        <p className="eyebrow">Private order tracking</p>
        <h1>Track your order</h1>
        <p className="text-[var(--muted)]">
          Enter the order number and mobile number used at checkout. We will send a short-lived
          verification code when the details match.
        </p>
        {query.error ? (
          <p className="rounded-xl bg-red-50 p-4 text-red-800">Please wait and try again.</p>
        ) : null}
        <form
          action={requestTrackingCodeAction}
          className="mt-8 grid gap-4 rounded-2xl bg-surface p-6"
        >
          <label>
            Order number
            <input autoComplete="off" maxLength={80} name="orderNumber" required />
          </label>
          <label>
            Mobile number
            <input autoComplete="tel" maxLength={30} name="mobileNumber" required type="tel" />
          </label>
          <button className="button-primary" type="submit">
            Send verification code
          </button>
        </form>
        <p className="mt-4 text-sm text-[var(--muted)]">
          For privacy, this page gives the same response whether or not an order matches.
        </p>
      </section>
    </StorefrontMain>
  );
}
