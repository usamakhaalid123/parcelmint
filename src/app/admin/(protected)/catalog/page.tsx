import Link from "next/link";

import { adminStyles, statusStyles } from "@/modules/catalog/components/admin-styles";
import { listCatalogProducts } from "@/modules/catalog/server/catalog-repository";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const products = await listCatalogProducts();

  return (
    <main className={adminStyles.main} id="main-content">
      <header className={adminStyles.pageHeaderRow}>
        <div>
          <p className={adminStyles.eyebrow}>Catalog</p>
          <h1 className={adminStyles.pageTitle}>Products</h1>
          <p className={adminStyles.muted}>
            Lifecycle and inventory availability stay separate and server-authoritative.
          </p>
        </div>
        <div className={adminStyles.actionGroup}>
          <a className={adminStyles.secondaryAction} href="/api/v1/admin/catalog/export">
            Export CSV
          </a>
          <Link className={adminStyles.secondaryAction} href="/admin/catalog/import">
            Import CSV
          </Link>
          <Link className={adminStyles.primaryAction} href="/admin/catalog/new">
            Add product
          </Link>
        </div>
      </header>

      {products.length === 0 ? (
        <section className={`${adminStyles.section} text-center`}>
          <h2 className={adminStyles.sectionTitle}>No products yet</h2>
          <p className="mx-auto my-4 max-w-xl text-[var(--muted)]">
            Create a product with its first variant and opening stock.
          </p>
          <Link className={adminStyles.primaryAction} href="/admin/catalog/new">
            Create the first product
          </Link>
        </section>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Status</th>
                <th scope="col">Base price</th>
                <th scope="col">Variants</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    <span className="block text-sm text-[var(--muted)]">/{product.slug}</span>
                  </td>
                  <td>
                    <span className={`${adminStyles.pill} ${statusStyles[product.status]}`}>
                      {product.status}
                    </span>
                  </td>
                  <td>
                    {product.currencyCode} {product.basePriceMinor.toLocaleString()} minor units
                  </td>
                  <td>{product.variantCount}</td>
                  <td>
                    <Link
                      className="font-extrabold text-primary"
                      href={`/admin/catalog/${product.id}`}
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
