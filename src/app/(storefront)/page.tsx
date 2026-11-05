import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/modules/storefront/components/product-card";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";
import {
  listCachedStorefrontFacets,
  listCachedStorefrontProducts,
} from "@/modules/storefront/server/storefront-cache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop confidently with cash on delivery",
  description: "Discover available products with clear pricing and cash-on-delivery checkout.",
  alternates: { canonical: "/" },
  openGraph: {
    description: "Discover available products with clear pricing and cash-on-delivery checkout.",
    title: "ParcelMint",
    type: "website",
    url: "/",
  },
};

export default async function HomePage() {
  const [featured, facets] = await Promise.all([
    listCachedStorefrontProducts({ page: 1, sort: "newest" }),
    listCachedStorefrontFacets(),
  ]);

  return (
    <StorefrontMain>
      <section className="grid min-h-[72vh] grid-cols-[1.2fr_0.8fr] items-center gap-12 py-[clamp(4rem,10vw,8rem)] max-md:grid-cols-1">
        <div>
          <p className="eyebrow">Cash on delivery, made clear</p>
          <h1>Find what you need. Pay when it arrives.</h1>
          <p className="hero-copy">
            Browse available products, compare variants, and see prices before beginning checkout.
          </p>
          <form action="/products" className="flex max-w-2xl gap-2 max-sm:flex-col" role="search">
            <label className="sr-only" htmlFor="home-search">
              Search products
            </label>
            <input
              className="min-h-12 flex-1 rounded-lg border border-[var(--border)] bg-surface px-4"
              id="home-search"
              name="query"
              placeholder="Search by product or SKU"
              type="search"
            />
            <button className="primary-action" type="submit">
              Search products
            </button>
          </form>
        </div>
        <aside className="rounded-[2rem] border border-[var(--border)] bg-primary p-[clamp(1.5rem,5vw,3rem)] text-white shadow-[var(--shadow-card)]">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/70">
            Why ParcelMint
          </p>
          <ul className="mt-8 grid list-none gap-6 p-0">
            <li>
              <strong className="block text-xl">Server-verified prices</strong>
              <span className="text-white/75">Your final totals are calculated securely.</span>
            </li>
            <li>
              <strong className="block text-xl">Live availability</strong>
              <span className="text-white/75">
                Stock status comes from accountable inventory records.
              </span>
            </li>
            <li>
              <strong className="block text-xl">Guest-friendly shopping</strong>
              <span className="text-white/75">An account will not be required to purchase.</span>
            </li>
          </ul>
        </aside>
      </section>

      {facets.categories.length === 0 ? null : (
        <section
          aria-labelledby="categories-title"
          className="border-t border-[var(--border)] py-16"
        >
          <p className="eyebrow">Browse by category</p>
          <h2 id="categories-title">Start with what interests you.</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {facets.categories.slice(0, 8).map((category) => (
              <Link
                className="rounded-full border border-[var(--border)] bg-surface px-5 py-3 font-bold no-underline hover:border-primary"
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                key={category.slug}
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="featured-title" className="border-t border-[var(--border)] py-16">
        <div className="flex items-end justify-between gap-5 max-sm:items-start">
          <div>
            <p className="eyebrow">Recently added</p>
            <h2 id="featured-title">Explore the latest products.</h2>
          </div>
          <Link className="font-bold text-primary" href="/products">
            View all
          </Link>
        </div>
        {featured.items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[var(--border)] bg-surface p-10 text-center">
            <h3>Products are being prepared.</h3>
            <p className="text-[var(--muted)]">Please check back soon.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {featured.items.slice(0, 6).map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        )}
      </section>
    </StorefrontMain>
  );
}
