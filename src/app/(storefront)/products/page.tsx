import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { ProductCard } from "@/modules/storefront/components/product-card";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";
import { parseStorefrontCatalogQuery } from "@/modules/storefront/schemas/catalog-query";
import {
  listCachedStorefrontFacets,
  listCachedStorefrontProducts,
} from "@/modules/storefront/server/storefront-cache";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const values = await searchParams;
  const filtered = Object.values(values).some((value) => value !== undefined && value !== "");
  return {
    title: "Shop all products",
    description: "Search and filter available ParcelMint products.",
    alternates: { canonical: "/products" },
    robots: filtered ? { follow: true, index: false } : { follow: true, index: true },
  };
}

function pageHref(values: SearchParams, page: number): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const scalar = Array.isArray(value) ? value[0] : value;
    if (scalar !== undefined && scalar !== "" && key !== "page") parameters.set(key, scalar);
  }
  if (page > 1) parameters.set("page", String(page));
  const query = parameters.toString();
  return query === "" ? "/products" : `/products?${query}`;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  let query;
  try {
    query = parseStorefrontCatalogQuery(raw);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    return (
      <StorefrontMain>
        <section className="py-20">
          <p className="eyebrow">Catalog</p>
          <h1>Review your filters.</h1>
          <p role="alert" className="max-w-xl text-[var(--danger)]">
            One or more search filters are invalid.
          </p>
          <Link className="primary-action" href="/products">
            Clear filters
          </Link>
        </section>
      </StorefrontMain>
    );
  }

  const [catalog, facets] = await Promise.all([
    listCachedStorefrontProducts(query),
    listCachedStorefrontFacets(),
  ]);

  return (
    <StorefrontMain>
      <header className="py-14">
        <p className="eyebrow">Catalog</p>
        <h1 className="max-w-3xl!">Find your next essential.</h1>
        <p className="text-[var(--muted)]">
          {catalog.total} {catalog.total === 1 ? "product" : "products"}
        </p>
      </header>
      <div className="grid grid-cols-[17rem_1fr] gap-8 max-lg:grid-cols-1">
        <aside aria-label="Product filters">
          <form
            action="/products"
            className="sticky top-5 grid gap-4 rounded-2xl border border-[var(--border)] bg-surface p-5 max-lg:static"
          >
            <label className="grid gap-1 font-bold">
              Search
              <input
                className="min-h-11 rounded-lg border border-[var(--border)] bg-background px-3"
                defaultValue={query.query}
                name="query"
                type="search"
              />
            </label>
            <label className="grid gap-1 font-bold">
              Category
              <select
                className="min-h-11 rounded-lg border border-[var(--border)] bg-background px-3"
                defaultValue={query.category ?? ""}
                name="category"
              >
                <option value="">All categories</option>
                {facets.categories.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 font-bold">
              Brand
              <select
                className="min-h-11 rounded-lg border border-[var(--border)] bg-background px-3"
                defaultValue={query.brand ?? ""}
                name="brand"
              >
                <option value="">All brands</option>
                {facets.brands.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 font-bold">
              Availability
              <select
                className="min-h-11 rounded-lg border border-[var(--border)] bg-background px-3"
                defaultValue={query.availability ?? ""}
                name="availability"
              >
                <option value="">Any availability</option>
                <option value="in_stock">Available</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm font-bold">
                Min price
                <input
                  className="min-h-11 min-w-0 rounded-lg border border-[var(--border)] bg-background px-3"
                  defaultValue={query.minPrice}
                  min={0}
                  name="minPrice"
                  step={1}
                  type="number"
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                Max price
                <input
                  className="min-h-11 min-w-0 rounded-lg border border-[var(--border)] bg-background px-3"
                  defaultValue={query.maxPrice}
                  min={0}
                  name="maxPrice"
                  step={1}
                  type="number"
                />
              </label>
            </div>
            <label className="grid gap-1 font-bold">
              Sort
              <select
                className="min-h-11 rounded-lg border border-[var(--border)] bg-background px-3"
                defaultValue={query.sort}
                name="sort"
              >
                <option value="newest">Newest</option>
                <option value="name">Name</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
            <button className="primary-action" type="submit">
              Apply filters
            </button>
            <Link className="text-center font-bold text-primary" href="/products">
              Clear all
            </Link>
          </form>
        </aside>
        <section aria-label="Products">
          {catalog.items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border)] bg-surface p-10 text-center">
              <h2 className="mx-auto">No products match.</h2>
              <p className="text-[var(--muted)]">
                Try removing a filter or searching for another term.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-5 max-xl:grid-cols-2 max-sm:grid-cols-1">
              {catalog.items.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          )}
          {catalog.pageCount > 1 ? (
            <nav
              aria-label="Catalog pages"
              className="mt-10 flex items-center justify-between gap-4"
            >
              {catalog.page > 1 ? (
                <Link
                  className="rounded-lg border border-[var(--border)] bg-surface px-4 py-2 font-bold no-underline"
                  href={pageHref(raw, catalog.page - 1)}
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {catalog.page} of {catalog.pageCount}
              </span>
              {catalog.page < catalog.pageCount ? (
                <Link
                  className="rounded-lg border border-[var(--border)] bg-surface px-4 py-2 font-bold no-underline"
                  href={pageHref(raw, catalog.page + 1)}
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </StorefrontMain>
  );
}
