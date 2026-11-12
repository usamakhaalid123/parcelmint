import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card } from "@/components/ui";
import { getServerEnvironment } from "@/config/env";
import { AddToCartForm } from "@/modules/checkout/components/add-to-cart-form";
import {
  formatMoney,
  minorUnitsToMajor,
  ProductCard,
} from "@/modules/storefront/components/product-card";
import { StorefrontIcon } from "@/modules/storefront/components/storefront-icon";
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
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 py-6 text-sm text-muted"
      >
        <Link className="font-bold text-muted-strong no-underline hover:text-primary" href="/">
          Home
        </Link>
        <StorefrontIcon className="size-3" name="arrow" />
        <Link
          className="font-bold text-muted-strong no-underline hover:text-primary"
          href="/products"
        >
          Products
        </Link>
        <StorefrontIcon className="size-3" name="arrow" />
        <span aria-current="page" className="truncate">
          {product.name}
        </span>
      </nav>
      <div className="grid grid-cols-[1.05fr_0.95fr] items-start gap-10 pb-8 lg:gap-16 max-lg:grid-cols-1">
        <section aria-label="Product images">
          <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-border bg-surface-strong shadow-card">
            {selectedImage === undefined ? (
              <div className="grid h-full place-items-center text-center font-bold text-muted">
                <div>
                  <StorefrontIcon className="mx-auto mb-4 size-16" name="package" />
                  Product image coming soon
                </div>
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
            <div className="mt-3 grid grid-cols-5 gap-3 max-sm:grid-cols-4">
              {product.images.map((image) => (
                <Link
                  aria-current={image.id === selectedImage?.id ? "true" : undefined}
                  aria-label={`View ${image.altText}`}
                  className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-surface-strong transition ${image.id === selectedImage?.id ? "border-primary ring-2 ring-primary-soft" : "border-transparent hover:border-border-strong"}`}
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

        <section className="lg:sticky lg:top-24">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
              {product.brandName ?? "ParcelMint selection"}
            </p>
            <Badge tone={available ? "success" : "neutral"}>
              {available ? "In stock" : "Out of stock"}
            </Badge>
          </div>
          <h1 className="break-words text-[clamp(2.25rem,4vw,4rem)] leading-[1.02] tracking-[-0.045em]">
            {product.name}
          </h1>
          <p className="mt-5 font-display text-3xl font-extrabold text-foreground">
            {formatMoney(priceMinor, product.currencyCode)}
          </p>
          <p className="mt-5 text-base leading-7 text-muted sm:text-lg">
            {product.description || "Product details are available from the selected variant."}
          </p>
          {product.variants.length > 0 ? (
            <fieldset className="mt-8 border-0 p-0">
              <legend className="mb-3 font-display text-lg font-bold">Choose a variant</legend>
              <div className="flex flex-wrap gap-3">
                {product.variants.map((variant) => (
                  <Link
                    aria-current={variant.id === selectedVariant?.id ? "true" : undefined}
                    className={`min-h-11 rounded-lg border px-4 py-3 text-sm font-bold no-underline transition ${variant.id === selectedVariant?.id ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-surface text-foreground hover:border-primary hover:text-primary"}`}
                    href={`/products/${product.slug}?variant=${variant.id}${selectedImage === undefined ? "" : `&image=${selectedImage.id}`}`}
                    key={variant.id}
                  >
                    {variant.title}
                  </Link>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="my-8 rounded-card border border-border bg-surface p-5 shadow-card">
            <AddToCartForm available={available} variantId={selectedVariant?.id ?? ""} />
            <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-sm leading-6 text-muted">
              <StorefrontIcon className="mt-0.5 size-5 shrink-0 text-primary" name="cash" />
              No advance payment. The final total and delivery charge are shown before you submit
              your cash-on-delivery order.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs font-bold tracking-wider text-muted uppercase">
                Availability
              </dt>
              <dd className="mt-1 font-bold">{available ? "Ready to order" : "Out of stock"}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs font-bold tracking-wider text-muted uppercase">SKU</dt>
              <dd className="mt-1 truncate font-mono text-sm">
                {selectedVariant?.sku ?? "Unavailable"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section aria-labelledby="delivery-title" className="mt-12 grid gap-4 md:grid-cols-3">
        <Card className="shadow-none">
          <StorefrontIcon className="mb-4 size-7 text-primary" name="truck" />
          <h2 className="text-lg" id="delivery-title">
            Delivery made clear
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Availability and the final delivery charge are confirmed during checkout.
          </p>
          <Link
            className="mt-3 inline-block text-sm font-bold text-primary"
            href="/content/shipping"
          >
            Shipping information
          </Link>
        </Card>
        <Card className="shadow-none">
          <StorefrontIcon className="mb-4 size-7 text-primary" name="shield" />
          <h2 className="text-lg">Return guidance</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Check eligibility and return conditions before placing your order.
          </p>
          <Link
            className="mt-3 inline-block text-sm font-bold text-primary"
            href="/content/returns"
          >
            Review return terms
          </Link>
        </Card>
        <Card className="shadow-none">
          <StorefrontIcon className="mb-4 size-7 text-primary" name="cash" />
          <h2 className="text-lg">Pay on arrival</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Guest checkout is supported and no online payment is required.
          </p>
        </Card>
      </section>

      {related === null ? null : (
        <section aria-labelledby="related-title" className="mt-20 border-t border-border py-16">
          <p className="mb-3 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
            You may also like
          </p>
          <h2 className="text-3xl sm:text-4xl" id="related-title">
            More to explore
          </h2>
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
