import Link from "next/link";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { adminStyles } from "@/modules/catalog/components/admin-styles";
import { CatalogImportForm } from "@/modules/catalog/components/catalog-import-form";
import { catalogCsvHeaders } from "@/modules/catalog/domain/catalog-csv";

export default async function CatalogImportPage() {
  await requirePermission("catalog.manage");

  return (
    <main className={adminStyles.main} id="main-content">
      <header className={adminStyles.pageHeader}>
        <Link className={adminStyles.backLink} href="/admin/catalog">
          ← Products
        </Link>
        <p className={adminStyles.eyebrow}>Bulk operations</p>
        <h1 className={adminStyles.pageTitle}>Import catalog CSV</h1>
        <p className={adminStyles.muted}>
          Every row must be valid. Any validation or database error rolls back the entire import.
        </p>
      </header>

      <CatalogImportForm />

      <section className={`${adminStyles.section} mt-5`} aria-labelledby="csv-columns-title">
        <h2 className={adminStyles.sectionTitle} id="csv-columns-title">
          Required column order
        </h2>
        <code className="my-4 block overflow-x-auto rounded-lg bg-foreground p-4 text-surface whitespace-nowrap">
          {catalogCsvHeaders.join(",")}
        </code>
        <p className="m-0 text-[var(--muted)]">
          Download the current export from the Products page to use as a template.
        </p>
      </section>
    </main>
  );
}
