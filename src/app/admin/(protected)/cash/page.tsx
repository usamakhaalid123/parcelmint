import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requirePermission } from "@/modules/auth/server/require-permission";
import {
  reconcileCashCollectionAction,
  recordCollectionFailureAction,
  recordCourierCollectionAction,
  recordRemittanceBatchAction,
  resolveCashDiscrepancyAction,
  writeOffFailedCollectionAction,
} from "@/modules/reporting/server/cash-actions";
import { listCashCollections } from "@/modules/reporting/server/cash-service";
import { formatMoney } from "@/modules/storefront/components/product-card";

export const metadata: Metadata = { title: "COD cash operations" };

function OperationForm({
  action,
  button,
  children,
  orderId,
}: {
  action: (formData: FormData) => Promise<never>;
  button: string;
  children?: ReactNode;
  orderId: string;
}) {
  return (
    <form action={action} className="grid gap-2 rounded-xl border border-[var(--border)] p-3">
      <input name="orderId" type="hidden" value={orderId} />
      {children}
      <label>
        Operational reason
        <input name="reason" required minLength={3} />
      </label>
      <button className="button-secondary" type="submit">
        {button}
      </button>
    </form>
  );
}

export default async function CashOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requirePermission("cash.reconcile");
  const [collections, query] = await Promise.all([listCashCollections(), searchParams]);
  return (
    <main className="mx-auto w-full max-w-7xl px-[clamp(1rem,4vw,3rem)] py-10" id="main-content">
      <header className="mb-8">
        <p className="eyebrow">Phase 7</p>
        <h1>COD cash operations</h1>
        <p className="text-[var(--muted)]">
          Record courier collections, remittance batches, reconciliation, and discrepancies.
        </p>
      </header>
      {query.notice ? <p className="rounded-xl bg-green-50 p-4">Cash record updated.</p> : null}
      {query.error ? (
        <p className="form-alert">The cash operation could not be completed.</p>
      ) : null}
      <div className="grid gap-5">
        {collections.map((collection) => (
          <article
            className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-card)]"
            key={collection.orderId}
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-xl">{collection.orderNumber}</h2>
                <p className="m-0 text-sm text-[var(--muted)]">
                  Expected {formatMoney(collection.expectedAmountMinor, collection.currencyCode)}
                </p>
              </div>
              <strong>{collection.state.replaceAll("_", " ")}</strong>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {["collection_due", "collection_failed"].includes(collection.state) ? (
                <OperationForm
                  action={recordCourierCollectionAction}
                  button="Record collection"
                  orderId={collection.orderId}
                >
                  <label>
                    Collected amount (minor units)
                    <input name="collectedAmountMinor" required min={0} step={1} type="number" />
                  </label>
                  <label>
                    Courier reference
                    <input name="courierReference" required />
                  </label>
                  <label>
                    Collected at
                    <input name="collectedAt" required type="datetime-local" />
                  </label>
                </OperationForm>
              ) : null}
              {collection.state === "collection_due" ? (
                <OperationForm
                  action={recordCollectionFailureAction}
                  button="Record collection failure"
                  orderId={collection.orderId}
                />
              ) : null}
              {collection.state === "collection_failed" ? (
                <OperationForm
                  action={writeOffFailedCollectionAction}
                  button="Write off failed collection"
                  orderId={collection.orderId}
                />
              ) : null}
              {collection.state === "collected_by_courier" ? (
                <OperationForm
                  action={recordRemittanceBatchAction}
                  button="Record remittance"
                  orderId={collection.orderId}
                >
                  <label>
                    Remittance batch
                    <input name="remittanceBatch" required />
                  </label>
                </OperationForm>
              ) : null}
              {collection.state === "remittance_pending" ? (
                <OperationForm
                  action={reconcileCashCollectionAction}
                  button="Reconcile remittance"
                  orderId={collection.orderId}
                >
                  <label>
                    Remitted amount (minor units)
                    <input name="remittedAmountMinor" required min={0} step={1} type="number" />
                  </label>
                </OperationForm>
              ) : null}
              {collection.state === "disputed" ? (
                <OperationForm
                  action={resolveCashDiscrepancyAction}
                  button="Resolve discrepancy"
                  orderId={collection.orderId}
                >
                  <p>
                    Difference:{" "}
                    {formatMoney(
                      collection.discrepancyDifferenceMinor ?? 0,
                      collection.currencyCode,
                    )}
                  </p>
                  <label>
                    Resolution
                    <select name="resolution" required>
                      <option value="accept_actual">Accept actual remittance</option>
                      <option value="write_off">Write off discrepancy</option>
                    </select>
                  </label>
                </OperationForm>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
