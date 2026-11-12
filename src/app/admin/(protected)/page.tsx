import Link from "next/link";

import { cardStyles, cx, PageContainer } from "@/components/ui";

export default function AdminDashboardPage() {
  return (
    <PageContainer>
      <header className="mb-10">
        <div>
          <p className="mb-4 text-xs font-extrabold tracking-[0.11em] text-primary uppercase">
            Administration
          </p>
          <h1 className="mb-3 max-w-[22ch] text-[clamp(2.25rem,6vw,4.5rem)]">
            Operations overview
          </h1>
          <p className="m-0 max-w-2xl text-[var(--muted)]">
            Manage the catalog and keep every stock change traceable.
          </p>
        </div>
      </header>
      <section
        className="grid grid-cols-2 gap-4 max-md:grid-cols-1"
        aria-label="Available administration modules"
      >
        <Link className={cx(cardStyles.interactive, "min-h-56 no-underline")} href="/admin/catalog">
          <span className="text-xs font-extrabold tracking-[0.08em] text-primary uppercase">
            Phase 2
          </span>
          <h2 className="my-4 max-w-none text-[clamp(1.5rem,3vw,2.25rem)]">
            Catalog &amp; inventory
          </h2>
          <p className="max-w-lg text-[var(--muted)]">
            Create products and variants, control lifecycle state, and adjust stock.
          </p>
        </Link>
        <Link className={cx(cardStyles.interactive, "min-h-56 no-underline")} href="/admin/reports">
          <span className="text-xs font-extrabold tracking-[0.08em] text-primary uppercase">
            Phase 7
          </span>
          <h2 className="my-4 max-w-none text-[clamp(1.5rem,3vw,2.25rem)]">
            COD reconciliation &amp; reports
          </h2>
          <p className="max-w-lg text-[var(--muted)]">
            Trace collections and remittances, resolve discrepancies, and export operational values.
          </p>
        </Link>
        <Link className={cx(cardStyles.interactive, "min-h-56 no-underline")} href="/admin/orders">
          <span className="text-xs font-extrabold tracking-[0.08em] text-primary uppercase">
            Phase 5
          </span>
          <h2 className="my-4 max-w-none text-[clamp(1.5rem,3vw,2.25rem)]">Orders</h2>
          <p className="max-w-lg text-[var(--muted)]">
            Verify COD orders, manage packing and courier handoff, and record delivery events.
          </p>
        </Link>
      </section>
    </PageContainer>
  );
}
