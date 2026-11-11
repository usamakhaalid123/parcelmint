import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { getOrderConfirmation } from "@/modules/checkout/server/checkout-service";
import { formatMoney } from "@/modules/storefront/components/product-card";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Order received",
};
export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).orderId);
  if (!parsed.success) notFound();
  const order = await getOrderConfirmation(parsed.data);
  if (order === null) notFound();

  return (
    <StorefrontMain>
      <section className="mx-auto max-w-2xl py-20 text-center">
        <p className="eyebrow">Order received</p>
        <h1>Thank you for your order</h1>
        <p className="text-lg text-[var(--muted)]">
          Your cash-on-delivery order is pending verification. We will provide the next verification
          step using your submitted contact details.
        </p>
        <dl className="my-8 grid grid-cols-2 gap-3 text-left max-sm:grid-cols-1">
          <div className="rounded-xl bg-surface p-4">
            <dt className="text-sm text-[var(--muted)]">Order number</dt>
            <dd className="font-black">{order.orderNumber}</dd>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <dt className="text-sm text-[var(--muted)]">Order total</dt>
            <dd className="font-black">{formatMoney(order.grandTotalMinor, order.currencyCode)}</dd>
          </div>
          <div className="rounded-xl bg-surface p-4 sm:col-span-2">
            <dt className="text-sm text-[var(--muted)]">Verification</dt>
            <dd className="font-black">Pending verification</dd>
          </div>
        </dl>
        <p className="text-sm text-[var(--muted)]">
          Save the order number for support. Order tracking with secure phone verification is
          introduced in the customer-account phase.
        </p>
        <Link className="button-primary inline-flex" href="/products">
          Continue shopping
        </Link>
      </section>
    </StorefrontMain>
  );
}
