import { requirePermission } from "@/modules/auth/server/require-permission";
import { adminStyles } from "@/modules/catalog/components/admin-styles";
import {
  createOperationalBlockAction,
  removeOperationalBlockAction,
} from "@/modules/orders/server/blocklist-actions";
import { listOperationalBlocks } from "@/modules/orders/server/blocklist-service";

export const dynamic = "force-dynamic";

export default async function OperationalBlocksPage() {
  await requirePermission("customers.blocklist");
  const blocks = await listOperationalBlocks();
  return (
    <main className={adminStyles.main} id="main-content">
      <header className={adminStyles.pageHeader}>
        <p className={adminStyles.eyebrow}>Fraud controls</p>
        <h1 className={adminStyles.pageTitle}>Operational blocks</h1>
        <p className={adminStyles.muted}>
          Values are stored only as one-way hashes. Every addition and removal is audited.
        </p>
      </header>
      <form action={createOperationalBlockAction} className={adminStyles.compactForm}>
        <label>
          Type
          <select name="type">
            <option value="mobile">Mobile</option>
            <option value="address">Address</option>
          </select>
        </label>
        <label>
          Value
          <input name="value" required />
        </label>
        <label>
          Reason
          <input minLength={3} name="reason" required />
        </label>
        <label>
          Expires at <span>(optional)</span>
          <input name="expiresAt" type="datetime-local" />
        </label>
        <button className={adminStyles.primaryAction} type="submit">
          Create block
        </button>
      </form>
      <section className={`${adminStyles.section} mt-6`}>
        <h2>Active and historical controls</h2>
        {blocks.length === 0 ? (
          <p>No operational blocks.</p>
        ) : (
          blocks.map((block) => (
            <article className="mb-3 rounded-xl border border-[var(--border)] p-4" key={block.id}>
              <p>
                <strong>{block.type}</strong> · {block.valueHash.slice(0, 12)}…
              </p>
              <p>{block.reason}</p>
              <form action={removeOperationalBlockAction} className="flex flex-wrap gap-2">
                <input name="blockId" type="hidden" value={block.id} />
                <input aria-label="Removal reason" minLength={3} name="reason" required />
                <button className={adminStyles.secondaryAction} type="submit">
                  Remove with audit
                </button>
              </form>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
