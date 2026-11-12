import type { Metadata } from "next";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { getOperationalDashboard } from "@/modules/reporting/server/reporting-service";
import { formatMoney } from "@/modules/storefront/components/product-card";

export const metadata: Metadata = { title: "Operational reports" };

export default async function OperationalReportsPage() {
  await requirePermission("reports.read");
  const dashboard = await getOperationalDashboard();
  return (
    <main className="mx-auto w-full max-w-7xl px-[clamp(1rem,4vw,3rem)] py-10" id="main-content">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Phase 7</p>
          <h1>Operational reporting</h1>
          <p className="max-w-3xl text-[var(--muted)]">
            Submitted order value, delivered merchandise value, collected cash, and reconciled cash
            are intentionally separate operational measures.
          </p>
        </div>
        <a className="button-secondary" href="/api/v1/admin/reports/cod.csv">
          Download traceable CSV
        </a>
      </header>
      <section
        className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="Operational counts"
      >
        {Object.entries({
          "Pending verification": dashboard.counts.pendingVerification,
          "Pending fulfillment": dashboard.counts.pendingFulfillment,
          "Failed deliveries": dashboard.counts.failedDeliveries,
          "Active returns": dashboard.counts.activeReturns,
          "Low stock": dashboard.counts.lowStock,
        }).map(([label, value]) => (
          <article className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-card)]" key={label}>
            <p className="m-0 text-sm text-[var(--muted)]">{label}</p>
            <strong className="text-3xl">{value}</strong>
          </article>
        ))}
      </section>
      <div className="grid gap-6">
        {dashboard.currencies.map((summary) => (
          <section
            className="rounded-3xl border border-[var(--border)] bg-surface p-6"
            key={summary.currencyCode}
          >
            <h2>{summary.currencyCode} operational values</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Submitted order value", summary.submittedOrderValueMinor],
                ["Delivered merchandise value", summary.deliveredMerchandiseValueMinor],
                ["Cash collected", summary.cashCollectedMinor],
                ["Cash reconciled", summary.cashReconciledMinor],
              ].map(([label, amount]) => (
                <article className="rounded-xl bg-[var(--surface-strong)] p-4" key={String(label)}>
                  <p className="m-0 text-sm text-[var(--muted)]">{label}</p>
                  <strong>{formatMoney(Number(amount), summary.currencyCode)}</strong>
                </article>
              ))}
            </div>
            <p className="mb-0 text-sm text-[var(--muted)]">
              Orders today: {summary.ordersToday} · Cash awaiting reconciliation:{" "}
              {formatMoney(summary.cashAwaitingReconciliationMinor, summary.currencyCode)} · Open
              discrepancies: {summary.openDiscrepancies}
            </p>
          </section>
        ))}
        {dashboard.currencies.length === 0 ? (
          <p>No operational order data is available yet.</p>
        ) : null}
      </div>
    </main>
  );
}
