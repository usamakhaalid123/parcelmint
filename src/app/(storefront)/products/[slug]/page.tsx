import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getServerEnvironment } from "@/config/env";
import { AddToCartForm } from "@/modules/checkout/components/add-to-cart-form";
import {
  formatMoney,
  minorUnitsToMajor,
  ProductCard,
} from "@/modules/storefront/components/product-card";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";
import {
  getCachedStorefrontProduct,
  listCachedStorefrontProducts,
} from "@/modules/storefront/server/storefront-cache";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCachedStorefrontProduct(slug);
  if (product === null) return { title: "Product not found", robots: { index: false } };
  const description =
    product.description || `View ${product.name} variants, pricing, and availability.`;
  const primary = product.images.find(({ isPrimary }) => isPrimary) ?? product.images[0];
  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      description,
      images:
        primary === undefined
          ? undefined
          : [{ alt: primary.altText, url: `/api/v1/storefront/images/${primary.id}` }],
      title: product.name,
      type: "website",
      url: `/products/${product.slug}`,
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ image?: string; variant?: string }>;
}) {
  const { slug } = await params;
  const [product, query] = await Promise.all([getCachedStorefrontProduct(slug), searchParams]);
  if (product === null) notFound();
  const selectedVariant =
    product.variants.find(({ id }) => id === query.variant) ?? product.variants[0];
  const selectedImage =
    product.images.find(({ id }) => id === query.image) ??
    product.images.find(({ isPrimary }) => isPrimary) ??
    product.images[0];
  const priceMinor = selectedVariant?.priceOverrideMinor ?? product.basePriceMinor;
  const available =
    selectedVariant === undefined ? false : selectedVariant.availability !== "out_of_stock";
  const related =
    product.categories[0] === undefined
      ? null
      : await listCachedStorefrontProducts({
          category: product.categories[0].slug,
          page: 1,
          sort: "newest",
        });
  const appUrl = getServerEnvironment().appUrl;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": product.variants.length > 1 ? "ProductGroup" : "Product",
        brand:
          product.brandName === null ? undefined : { "@type": "Brand", name: product.brandName },
        description: product.description,
        image: product.images.map(({ id }) => `${appUrl}/api/v1/storefront/images/${id}`),
        name: product.name,
        offers: product.variants.map((variant) => ({
          "@type": "Offer",
          availability:
            variant.availability === "out_of_stock"
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
          price: minorUnitsToMajor(
            variant.priceOverrideMinor ?? product.basePriceMinor,
            product.currencyCode,
          ),
          priceCurrency: product.currencyCode,
          sku: variant.sku,
          url: `${appUrl}/products/${product.slug}?variant=${variant.id}`,
        })),
        url: `${appUrl}/products/${product.slug}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", item: appUrl, name: "Home", position: 1 },
          { "@type": "ListItem", item: `${appUrl}/products`, name: "Products", position: 2 },
          {
            "@type": "ListItem",
            item: `${appUrl}/products/${product.slug}`,
            name: product.name,
            position: 3,
          },
        ],
      },
    ],
  };

  return (
    <StorefrontMain>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
        type="application/ld+json"
      />
      <nav aria-label="Breadcrumb" className="py-6 text-sm text-[var(--muted)]">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span>{" "}
        <Link href="/products">Products</Link> <span aria-hidden="true">/</span>{" "}
        <span aria-current="page">{product.name}</span>
      </nav>
      <div className="grid grid-cols-[1.1fr_0.9fr] gap-12 max-lg:grid-cols-1">
        <section aria-label="Product images">
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface-strong)]">
            {selectedImage === undefined ? (
              <div className="grid h-full place-items-center font-bold text-[var(--muted)]">
                Product image coming soon
              </div>
            ) : (
              <Image
                alt={selectedImage.altText}
                className="object-cover"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 55vw"
                src={`/api/v1/storefront/images/${selectedImage.id}`}
              />
            )}
          </div>
          {product.images.length > 1 ? (
            <div className="mt-3 grid grid-cols-5 gap-2 max-sm:grid-cols-4">
              {product.images.map((image) => (
                <Link
                  aria-label={`View ${image.altText}`}
                  className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border)]"
                  href={`/products/${product.slug}?image=${image.id}${selectedVariant === undefined ? "" : `&variant=${selectedVariant.id}`}`}
                  key={image.id}
                >
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    sizes="20vw"
                    src={`/api/v1/storefront/images/${image.id}`}
                  />
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        <section>
          <p className="eyebrow">{product.brandName ?? "ParcelMint selection"}</p>
          <h1 className="text-[clamp(2.5rem,6vw,5rem)]!">{product.name}</h1>
          <p className="text-2xl font-black">{formatMoney(priceMinor, product.currencyCode)}</p>
          <p className="text-[var(--muted)]">
            {product.description || "Product details are available from the selected variant."}
          </p>
          {product.variants.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-xl">Choose a variant</h2>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <Link
                    aria-current={variant.id === selectedVariant?.id ? "true" : undefined}
                    className={`rounded-xl border px-4 py-3 font-bold no-underline ${variant.id === selectedVariant?.id ? "border-primary bg-primary text-white" : "border-[var(--border)] bg-surface"}`}
                    href={`/products/${product.slug}?variant=${variant.id}${selectedImage === undefined ? "" : `&image=${selectedImage.id}`}`}
                    key={variant.id}
                  >
                    {variant.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <dl className="my-8 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface p-4">
              <dt className="text-xs font-bold uppercase text-[var(--muted)]">Availability</dt>
              <dd className="mt-1 font-bold">{available ? "Available" : "Out of stock"}</dd>
            </div>
            <div className="rounded-xl bg-surface p-4">
              <dt className="text-xs font-bold uppercase text-[var(--muted)]">SKU</dt>
              <dd className="mt-1 font-mono text-sm">{selectedVariant?.sku ?? "Unavailable"}</dd>
            </div>
          </dl>
          <AddToCartForm available={available} variantId={selectedVariant?.id ?? ""} />
          <div className="rounded-2xl border border-[var(--border)] bg-surface p-5">
            <h2 className="text-xl">Delivery and returns</h2>
            <p className="text-sm text-[var(--muted)]">
              Delivery availability and the final charge are confirmed before order submission.
              Review the <Link href="/content/shipping">shipping information</Link> and{" "}
              <Link href="/content/returns">return terms</Link> before purchasing.
            </p>
          </div>
        </section>
      </div>

      {related === null ? null : (
        <section
          aria-labelledby="related-title"
          className="mt-20 border-t border-[var(--border)] py-16"
        >
          <p className="eyebrow">You may also like</p>
          <h2 id="related-title">Related products</h2>
          <div className="mt-8 grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {related.items
              .filter(({ slug: relatedSlug }) => relatedSlug !== product.slug)
              .slice(0, 3)
              .map((item) => (
                <ProductCard key={item.slug} product={item} />
              ))}
          </div>
        </section>
      )}
    </StorefrontMain>
  );
}
