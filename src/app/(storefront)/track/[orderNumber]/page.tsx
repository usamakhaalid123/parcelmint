import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { Alert, Button } from "@/components/ui";
import { isCustomerCancellationEligible } from "@/modules/orders/domain/return-policy";
import {
  cancelTrackedOrderAction,
  requestTrackedReturnAction,
} from "@/modules/orders/server/customer-order-actions";
import { getTrackedOrder } from "@/modules/orders/server/tracking-service";
import { formatMoney } from "@/modules/storefront/components/product-card";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Order status",
};
export const dynamic = "force-dynamic";

export default async function TrackedOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = (await cookies()).get("parcelmint_tracking")?.value;
  if (!token) notFound();
  const detail = await getTrackedOrder((await params).orderNumber, token);
  if (detail === null) notFound();
  const query = await searchParams;
  const canCancel = isCustomerCancellationEligible({
    fulfillmentState: detail.order.fulfillmentState,
    lifecycleState: detail.order.lifecycleState,
    shipmentState: detail.shipment?.status ?? null,
  });
  const canReturn = detail.shipment?.status === "delivered";
  return (
    <StorefrontMain>
      <section className="py-16">
        <p className="eyebrow">Order tracking</p>
        <h1>{detail.order.orderNumber}</h1>
        {query.notice ? <Alert tone="success">Your request was recorded.</Alert> : null}
        {query.error ? <Alert tone="error">The request could not be completed.</Alert> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-surface p-4">
            <strong>Verification</strong>
            <p>{detail.order.verificationState.replaceAll("_", " ")}</p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <strong>Fulfillment</strong>
            <p>{detail.order.fulfillmentState.replaceAll("_", " ")}</p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <strong>Shipment</strong>
            <p>{detail.shipment?.status?.replaceAll("_", " ") ?? "Not started"}</p>
          </div>
        </div>
        <h2 className="mt-10">Items</h2>
        <ul className="grid gap-3">
          {detail.items.map((item) => (
            <li
              className="flex justify-between rounded-xl border border-[var(--border)] p-4"
              key={item.id}
            >
              <span>
                {item.productName} × {item.quantity}
              </span>
              <strong>{formatMoney(item.lineTotalMinor, item.currencyCode)}</strong>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-right text-xl font-black">
          Total: {formatMoney(detail.order.grandTotalMinor, detail.order.currencyCode)}
        </p>
        {canCancel ? (
          <section className="mt-10 rounded-2xl bg-surface p-6">
            <h2>Cancel order</h2>
            <form action={cancelTrackedOrderAction} className="grid gap-3">
              <input name="orderNumber" type="hidden" value={detail.order.orderNumber} />
              <label>
                Cancellation reason
                <input minLength={3} name="reason" required />
              </label>
              <Button type="submit" variant="secondary">
                Cancel eligible order
              </Button>
            </form>
          </section>
        ) : null}
        {canReturn ? (
          <section className="mt-10 rounded-2xl bg-surface p-6">
            <h2>Request a return</h2>
            <p className="text-[var(--muted)]">
              Choose an item and quantity. Each partial return is tracked independently.
            </p>
            {detail.items.map((item) => (
              <form
                action={requestTrackedReturnAction}
                className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4"
                key={item.id}
              >
                <input name="orderNumber" type="hidden" value={detail.order.orderNumber} />
                <input name="orderItemId" type="hidden" value={item.id} />
                <strong>{item.productName}</strong>
                <label>
                  Quantity
                  <input max={item.quantity} min={1} name="quantity" required type="number" />
                </label>
                <label>
                  Reason
                  <input maxLength={500} minLength={3} name="reason" required />
                </label>
                <label>
                  Additional notes
                  <textarea maxLength={1000} name="customerNotes" rows={2} />
                </label>
                <Button type="submit" variant="secondary">
                  Request return
                </Button>
              </form>
            ))}
          </section>
        ) : null}
        {detail.returns.length > 0 ? (
          <section className="mt-10">
            <h2>Returns</h2>
            <ul className="grid gap-3">
              {detail.returns.map((entry) => (
                <li className="rounded-xl border border-[var(--border)] p-4" key={entry.id}>
                  <strong>{entry.status.replaceAll("_", " ")}</strong> — {entry.reason}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </StorefrontMain>
  );
}
