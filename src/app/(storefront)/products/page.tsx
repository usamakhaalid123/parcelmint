import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { Alert, buttonStyles, cardStyles, fieldStyles } from "@/components/ui";
import { ProductCard } from "@/modules/storefront/components/product-card";
import { StorefrontIcon } from "@/modules/storefront/components/storefront-icon";
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
        <section className="mx-auto max-w-2xl py-20 text-center">
          <p className="mb-3 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
            Catalog
          </p>
          <h1 className="text-4xl">Review your filters.</h1>
          <Alert className="my-6 text-left" role="alert" tone="error">
            One or more search filters are invalid.
          </Alert>
          <Link className={buttonStyles.primary} href="/products">
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
      <header className="border-b border-border py-10 sm:py-14">
        <p className="mb-3 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
          Shop ParcelMint
        </p>
        <div className="flex items-end justify-between gap-6 max-sm:block">
          <div>
            <h1 className="max-w-3xl text-4xl sm:text-5xl">Products for everyday moments.</h1>
            <p className="mt-3 text-muted">
              Browse clear prices, current availability, and cash-on-delivery options.
            </p>
          </div>
          <p className="shrink-0 font-bold text-muted-strong max-sm:mt-4" aria-live="polite">
            {catalog.total} {catalog.total === 1 ? "product" : "products"}
          </p>
        </div>
      </header>
      <div className="grid grid-cols-[17rem_1fr] gap-8 py-10 max-lg:grid-cols-1">
        <aside aria-label="Product filters" className="self-start">
          <details className="group" open>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-lg border border-border bg-surface px-4 font-bold shadow-sm lg:hidden [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <StorefrontIcon className="size-5" name="search" /> Filters and sort
              </span>
              <span aria-hidden="true" className="text-primary group-open:rotate-90">
                <StorefrontIcon className="size-4" name="arrow" />
              </span>
            </summary>
            <form
              action="/products"
              className="mt-3 grid gap-5 rounded-card border border-border bg-surface p-5 shadow-card lg:sticky lg:top-24 lg:mt-0"
            >
              <div className="hidden items-center justify-between lg:flex">
                <h2 className="text-lg">Filter products</h2>
                <StorefrontIcon className="size-5 text-primary" name="search" />
              </div>
              <label className={fieldStyles.label}>
                Search
                <input
                  className={fieldStyles.control}
                  defaultValue={query.query}
                  name="query"
                  placeholder="Name or SKU"
                  type="search"
                />
              </label>
              <label className={fieldStyles.label}>
                Category
                <select
                  className={fieldStyles.control}
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
              <label className={fieldStyles.label}>
                Brand
                <select
                  className={fieldStyles.control}
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
              <label className={fieldStyles.label}>
                Availability
                <select
                  className={fieldStyles.control}
                  defaultValue={query.availability ?? ""}
                  name="availability"
                >
                  <option value="">Any availability</option>
                  <option value="in_stock">Available</option>
                  <option value="out_of_stock">Out of stock</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={fieldStyles.label}>
                  Min price
                  <input
                    className={`${fieldStyles.control} min-w-0`}
                    defaultValue={query.minPrice}
                    min={0}
                    name="minPrice"
                    step={1}
                    type="number"
                  />
                </label>
                <label className={fieldStyles.label}>
                  Max price
                  <input
                    className={`${fieldStyles.control} min-w-0`}
                    defaultValue={query.maxPrice}
                    min={0}
                    name="maxPrice"
                    step={1}
                    type="number"
                  />
                </label>
              </div>
              <label className={fieldStyles.label}>
                Sort
                <select className={fieldStyles.control} defaultValue={query.sort} name="sort">
                  <option value="newest">Newest</option>
                  <option value="name">Name</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                </select>
              </label>
              <button className={buttonStyles.primary} type="submit">
                Apply filters
              </button>
              <Link className="text-center text-sm font-bold text-primary" href="/products">
                Clear all filters
              </Link>
            </form>
          </details>
        </aside>
        <section aria-label="Products">
          {catalog.items.length === 0 ? (
            <div className={`${cardStyles.default} border-dashed py-14 text-center`}>
              <span className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
                <StorefrontIcon name="search" />
              </span>
              <h2 className="mx-auto text-2xl">No products match.</h2>
              <p className="mx-auto mt-2 max-w-md text-muted">
                Try removing a filter or searching for another term.
              </p>
              <Link className={`${buttonStyles.secondary} mt-6`} href="/products">
                Reset filters
              </Link>
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
                <Link className={buttonStyles.secondary} href={pageHref(raw, catalog.page - 1)}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {catalog.page} of {catalog.pageCount}
              </span>
              {catalog.page < catalog.pageCount ? (
                <Link className={buttonStyles.secondary} href={pageHref(raw, catalog.page + 1)}>
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
