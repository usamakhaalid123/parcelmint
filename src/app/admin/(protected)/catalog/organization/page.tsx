import Link from "next/link";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { adminStyles } from "@/modules/catalog/components/admin-styles";
import {
  createBrandAction,
  createCategoryAction,
  setBrandArchivedAction,
  setCategoryArchivedAction,
} from "@/modules/catalog/server/actions";
import { listCatalogOrganization } from "@/modules/catalog/server/catalog-repository";

const notices: Readonly<Record<string, string>> = {
  "brand-created": "Brand created successfully.",
  "brand-updated": "Brand availability updated.",
  "category-created": "Category created successfully.",
  "category-updated": "Category availability updated.",
};

const errors: Readonly<Record<string, string>> = {
  invalid_input: "Review the submitted values.",
  operation_failed: "The operation failed. Try again or review server logs.",
  slug_conflict: "That slug is already in use.",
};

export default async function CatalogOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requirePermission("catalog.manage");
  const [organization, query] = await Promise.all([listCatalogOrganization(), searchParams]);
  const notice = query.notice === undefined ? undefined : notices[query.notice];
  const error = query.error === undefined ? undefined : errors[query.error];

  return (
    <main className={adminStyles.main} id="main-content">
      <header className={adminStyles.pageHeader}>
        <Link className={adminStyles.backLink} href="/admin/catalog">
          ← Products
        </Link>
        <p className={adminStyles.eyebrow}>Catalog organization</p>
        <h1 className={adminStyles.pageTitle}>Brands &amp; categories</h1>
        <p className={adminStyles.muted}>
          Maintain stable slugs and category hierarchy without deleting historical references.
        </p>
      </header>

      {notice === undefined ? null : (
        <p className={adminStyles.success} role="status">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <p className={adminStyles.alert} role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <section className={adminStyles.section} aria-labelledby="brands-title">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className={adminStyles.eyebrow}>Product makers</p>
              <h2 className={adminStyles.sectionTitle} id="brands-title">
                Brands
              </h2>
            </div>
            <span className="text-sm text-[var(--muted)]">{organization.brands.length} total</span>
          </div>
          <form action={createBrandAction} className={`${adminStyles.compactForm} mb-5`}>
            <label>
              Name
              <input maxLength={120} name="name" required />
            </label>
            <label>
              Slug <span>(optional)</span>
              <input maxLength={160} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
              <span>Leave blank to generate it from the name.</span>
            </label>
            <button
              className={`${adminStyles.primaryAction} ${adminStyles.fullSpan}`}
              type="submit"
            >
              Create brand
            </button>
          </form>
          {organization.brands.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No brands yet.</p>
          ) : (
            <ul className="grid list-none gap-3 p-0">
              {organization.brands.map((brand) => (
                <li className="rounded-xl border border-[var(--border)] p-4" key={brand.id}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <strong>{brand.name}</strong>
                      <span className="block text-xs text-[var(--muted)]">/{brand.slug}</span>
                    </div>
                    <span className={adminStyles.pill}>
                      {brand.archived ? "Archived" : "Active"}
                    </span>
                  </div>
                  <details className="rounded-lg border border-[var(--border)] bg-background">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                      {brand.archived ? "Restore options" : "Archive options"}
                    </summary>
                    <form
                      action={setBrandArchivedAction}
                      className="grid gap-2 border-t border-[var(--border)] p-3"
                    >
                      <input name="resourceId" type="hidden" value={brand.id} />
                      <input name="archived" type="hidden" value={String(!brand.archived)} />
                      <label className={adminStyles.label}>
                        Audit reason
                        <input className={adminStyles.input} minLength={3} name="reason" required />
                      </label>
                      <button className={adminStyles.secondaryAction} type="submit">
                        {brand.archived ? "Restore brand" : "Archive brand"}
                      </button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={adminStyles.section} aria-labelledby="categories-title">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className={adminStyles.eyebrow}>Store navigation</p>
              <h2 className={adminStyles.sectionTitle} id="categories-title">
                Categories
              </h2>
            </div>
            <span className="text-sm text-[var(--muted)]">
              {organization.categories.length} total
            </span>
          </div>
          <form action={createCategoryAction} className={`${adminStyles.compactForm} mb-5`}>
            <label>
              Name
              <input maxLength={120} name="name" required />
            </label>
            <label>
              Slug <span>(optional)</span>
              <input maxLength={160} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
              <span>Leave blank to generate it from the name.</span>
            </label>
            <label>
              Parent category
              <select defaultValue="" name="parentId">
                <option value="">No parent</option>
                {organization.categories
                  .filter((category) => !category.archived)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Position
              <input defaultValue={0} min={0} name="position" required step={1} type="number" />
              <span>Lower numbers appear first.</span>
            </label>
            <label className={adminStyles.fullSpan}>
              Description <span>(optional)</span>
              <textarea maxLength={2000} name="description" rows={3} />
            </label>
            <button
              className={`${adminStyles.primaryAction} ${adminStyles.fullSpan}`}
              type="submit"
            >
              Create category
            </button>
          </form>
          {organization.categories.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No categories yet.</p>
          ) : (
            <ul className="grid list-none gap-3 p-0">
              {organization.categories.map((category) => (
                <li className="rounded-xl border border-[var(--border)] p-4" key={category.id}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <strong>{category.name}</strong>
                      <span className="block text-xs text-[var(--muted)]">
                        /{category.slug}
                        {category.parentName === null ? "" : ` · Parent: ${category.parentName}`}
                      </span>
                    </div>
                    <span className={adminStyles.pill}>
                      {category.archived ? "Archived" : "Active"}
                    </span>
                  </div>
                  <details className="rounded-lg border border-[var(--border)] bg-background">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                      {category.archived ? "Restore options" : "Archive options"}
                    </summary>
                    <form
                      action={setCategoryArchivedAction}
                      className="grid gap-2 border-t border-[var(--border)] p-3"
                    >
                      <input name="resourceId" type="hidden" value={category.id} />
                      <input name="archived" type="hidden" value={String(!category.archived)} />
                      <label className={adminStyles.label}>
                        Audit reason
                        <input className={adminStyles.input} minLength={3} name="reason" required />
                      </label>
                      <button className={adminStyles.secondaryAction} type="submit">
                        {category.archived ? "Restore category" : "Archive category"}
                      </button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
