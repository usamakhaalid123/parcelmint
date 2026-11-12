import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { buttonStyles, cardStyles, fieldStyles } from "@/components/ui";
import { ProductCard } from "@/modules/storefront/components/product-card";
import { StorefrontIcon } from "@/modules/storefront/components/storefront-icon";
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
  const heroProduct = featured.items.find(({ image }) => image !== null) ?? featured.items[0];

  return (
    <StorefrontMain>
      <section className="grid items-center gap-10 py-12 md:min-h-[42rem] md:grid-cols-[1.05fr_0.95fr] md:py-16 lg:gap-16">
        <div className="max-w-2xl">
          <p className="mb-4 text-xs font-extrabold tracking-[0.16em] text-primary uppercase">
            Cash on delivery, without the guesswork
          </p>
          <h1 className="max-w-3xl text-[clamp(2.75rem,6vw,5rem)] leading-[0.98] tracking-[-0.055em]">
            Shop with confidence. Pay at your door.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted sm:text-xl">
            Clear prices, live availability, and a straightforward checkout—no account or advance
            payment required.
          </p>
          <form
            action="/products"
            className="mt-8 flex max-w-2xl gap-2 rounded-panel border border-border bg-surface p-2 shadow-card max-sm:flex-col"
            role="search"
          >
            <label className="sr-only" htmlFor="home-search">
              Search products
            </label>
            <div className="flex flex-1 items-center gap-3 px-2">
              <StorefrontIcon className="size-5 shrink-0 text-muted" name="search" />
              <input
                className={`${fieldStyles.control} min-h-12 flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0`}
                id="home-search"
                name="query"
                placeholder="What are you looking for?"
                type="search"
              />
            </div>
            <button className={`${buttonStyles.primary} min-h-12 px-6`} type="submit">
              Search products
            </button>
          </form>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-muted-strong">
            <span className="inline-flex items-center gap-2">
              <StorefrontIcon className="size-5 text-primary" name="check" /> No account needed
            </span>
            <span className="inline-flex items-center gap-2">
              <StorefrontIcon className="size-5 text-primary" name="check" /> Secure order handling
            </span>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-xl md:mx-0">
          <div className="absolute -top-5 -right-3 h-28 w-28 rounded-full bg-primary-soft blur-2xl sm:h-40 sm:w-40" />
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-surface shadow-xl">
            <div className="relative aspect-[4/3] bg-surface-strong">
              {heroProduct?.image === null || heroProduct === undefined ? (
                <div className="grid h-full place-items-center bg-primary-soft text-primary">
                  <StorefrontIcon className="size-20" name="package" />
                </div>
              ) : (
                <Image
                  alt={heroProduct.image.altText}
                  className="object-cover"
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 48vw"
                  src={`/api/v1/storefront/images/${heroProduct.image.id}`}
                />
              )}
            </div>
            {heroProduct === undefined ? null : (
              <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
                <div>
                  <p className="mb-1 text-xs font-bold tracking-wider text-muted uppercase">
                    Featured now
                  </p>
                  <strong className="font-display text-lg sm:text-xl">{heroProduct.name}</strong>
                </div>
                <Link
                  aria-label={`View ${heroProduct.name}`}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-white no-underline transition hover:bg-primary-hover"
                  href={`/products/${heroProduct.slug}`}
                >
                  <StorefrontIcon className="size-5" name="arrow" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        aria-label="Why shop with ParcelMint"
        className="grid grid-cols-3 divide-x divide-border rounded-card border border-border bg-surface shadow-card max-md:grid-cols-1 max-md:divide-x-0 max-md:divide-y"
      >
        {[
          {
            copy: "Pay only when your order reaches you.",
            icon: "cash" as const,
            title: "Cash on delivery",
          },
          {
            copy: "Availability is checked against live inventory.",
            icon: "package" as const,
            title: "Stock you can trust",
          },
          {
            copy: "Review delivery details before you submit.",
            icon: "truck" as const,
            title: "Clear delivery terms",
          },
        ].map((item) => (
          <div className="flex gap-4 p-5 sm:p-6" key={item.title}>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <StorefrontIcon className="size-5" name={item.icon} />
            </span>
            <div>
              <h2 className="text-base">{item.title}</h2>
              <p className="mt-1 text-sm leading-5 text-muted">{item.copy}</p>
            </div>
          </div>
        ))}
      </section>

      {facets.categories.length === 0 ? null : (
        <section aria-labelledby="categories-title" className="py-16 sm:py-20">
          <div className="flex items-end justify-between gap-5">
            <div>
              <p className="mb-3 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
                Browse by category
              </p>
              <h2 className="text-3xl sm:text-4xl" id="categories-title">
                Find your next essential.
              </h2>
            </div>
            <Link className="hidden font-bold text-primary sm:block" href="/products">
              Shop all
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {facets.categories.slice(0, 8).map((category) => (
              <Link
                className="group flex min-h-24 items-center justify-between rounded-card border border-border bg-surface p-5 font-bold text-foreground no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-card motion-reduce:transform-none"
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                key={category.slug}
              >
                <span>{category.name}</span>
                <span className="grid size-9 place-items-center rounded-full bg-surface-strong text-primary transition group-hover:bg-primary group-hover:text-white">
                  <StorefrontIcon className="size-4" name="arrow" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="featured-title" className="border-t border-border py-16 sm:py-20">
        <div className="flex items-end justify-between gap-5 max-sm:items-start">
          <div>
            <p className="mb-3 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
              Recently added
            </p>
            <h2 className="text-3xl sm:text-4xl" id="featured-title">
              Fresh finds, ready to browse.
            </h2>
          </div>
          <Link className="shrink-0 font-bold text-primary" href="/products">
            View all
          </Link>
        </div>
        {featured.items.length === 0 ? (
          <div className={`${cardStyles.default} mt-8 border-dashed text-center`}>
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
