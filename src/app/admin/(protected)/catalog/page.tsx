import Link from "next/link";

import { adminStyles, statusStyles } from "@/modules/catalog/components/admin-styles";
import { listCatalogProductPage } from "@/modules/catalog/server/catalog-repository";

export const dynamic = "force-dynamic";

function catalogHref(input: { page: number; query: string; status: string }): string {
  const parameters = new URLSearchParams();
  if (input.query !== "") parameters.set("q", input.query);
  if (input.status !== "") parameters.set("status", input.status);
  if (input.page > 1) parameters.set("page", String(input.page));
  const queryString = parameters.toString();
  return queryString === "" ? "/admin/catalog" : `/admin/catalog?${queryString}`;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const query = await searchParams;
  const searchQuery = query.q?.trim().slice(0, 100) ?? "";
  const status =
    query.status === "active" || query.status === "archived" || query.status === "draft"
      ? query.status
      : undefined;
  const parsedPage = Number.parseInt(query.page ?? "1", 10);
  const products = await listCatalogProductPage({
    page: Number.isFinite(parsedPage) ? parsedPage : 1,
    query: searchQuery,
    status,
  });
  const isEmptyCatalog = products.total === 0 && searchQuery === "" && status === undefined;

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
          <Link className={adminStyles.secondaryAction} href="/admin/catalog/organization">
            Brands &amp; categories
          </Link>
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

      <section className={`${adminStyles.section} mb-6`} aria-labelledby="find-products-title">
        <div className="mb-4 flex items-end justify-between gap-4 max-sm:flex-col max-sm:items-start">
          <div>
            <p className={adminStyles.eyebrow}>Quick find</p>
            <h2 className="m-0 text-xl" id="find-products-title">
              Find a product
            </h2>
          </div>
          <span className="text-sm text-[var(--muted)]">
            {products.total} {products.total === 1 ? "product" : "products"}
          </span>
        </div>
        <form className="grid grid-cols-[minmax(12rem,1fr)_12rem_auto] items-end gap-3 max-md:grid-cols-1">
          <label className={adminStyles.label}>
            Search by name or slug
            <input
              className={adminStyles.input}
              defaultValue={searchQuery}
              maxLength={100}
              name="q"
              placeholder="e.g. cotton shirt"
              type="search"
            />
          </label>
          <label className={adminStyles.label}>
            Status
            <select className={adminStyles.input} defaultValue={status ?? ""} name="status">
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button className={adminStyles.primaryAction} type="submit">
              Search
            </button>
            {searchQuery === "" && status === undefined ? null : (
              <Link className={adminStyles.secondaryAction} href="/admin/catalog">
                Clear
              </Link>
            )}
          </div>
        </form>
      </section>

      {products.items.length === 0 ? (
        <section className={`${adminStyles.section} text-center`}>
          <h2 className={adminStyles.sectionTitle}>
            {isEmptyCatalog ? "No products yet" : "No matching products"}
          </h2>
          <p className="mx-auto my-4 max-w-xl text-[var(--muted)]">
            {isEmptyCatalog
              ? "Create a product with its first variant and opening stock."
              : "Try a different name, slug, or lifecycle status."}
          </p>
          <Link
            className={adminStyles.primaryAction}
            href={isEmptyCatalog ? "/admin/catalog/new" : "/admin/catalog"}
          >
            {isEmptyCatalog ? "Create the first product" : "Clear filters"}
          </Link>
        </section>
      ) : (
        <>
          <div className={`${adminStyles.tableWrap} max-md:hidden`}>
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
                {products.items.map((product) => (
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
          <div className="grid gap-3 md:hidden" aria-label="Products">
            {products.items.map((product) => (
              <article className={adminStyles.section} key={product.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-xl">{product.name}</h2>
                    <span className="text-sm text-[var(--muted)]">/{product.slug}</span>
                  </div>
                  <span className={`${adminStyles.pill} ${statusStyles[product.status]}`}>
                    {product.status}
                  </span>
                </div>
                <p className="mb-4 text-sm text-[var(--muted)]">
                  {product.currencyCode} {product.basePriceMinor.toLocaleString()} minor units ·{" "}
                  {product.variantCount} {product.variantCount === 1 ? "variant" : "variants"}
                </p>
                <Link
                  className={`${adminStyles.primaryAction} w-full`}
                  href={`/admin/catalog/${product.id}`}
                >
                  Manage product
                </Link>
              </article>
            ))}
          </div>
          <nav className="mt-5 flex items-center justify-between gap-4" aria-label="Product pages">
            {products.page > 1 ? (
              <Link
                className={adminStyles.secondaryAction}
                href={catalogHref({
                  page: products.page - 1,
                  query: searchQuery,
                  status: status ?? "",
                })}
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-[var(--muted)]">
              Page {Math.min(products.page, products.pageCount)} of {products.pageCount}
            </span>
            {products.page < products.pageCount ? (
              <Link
                className={adminStyles.secondaryAction}
                href={catalogHref({
                  page: products.page + 1,
                  query: searchQuery,
                  status: status ?? "",
                })}
              >
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </main>
  );
}
