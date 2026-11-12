import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui";
import { StorefrontIcon } from "@/modules/storefront/components/storefront-icon";
import type { StorefrontProductCard } from "@/modules/storefront/server/storefront-repository";

const zeroDecimalCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
const threeDecimalCurrencies = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

function currencyMinorUnitDigits(currencyCode: string): number {
  if (zeroDecimalCurrencies.has(currencyCode)) return 0;
  if (threeDecimalCurrencies.has(currencyCode)) return 3;
  return 2;
}

export function formatMoney(minor: number, currencyCode: string): string {
  const formatter = new Intl.NumberFormat("en", {
    currency: currencyCode,
    style: "currency",
  });
  const digits = currencyMinorUnitDigits(currencyCode);
  return formatter.format(minor / 10 ** digits);
}

export function minorUnitsToMajor(minor: number, currencyCode: string): number {
  return minor / 10 ** currencyMinorUnitDigits(currencyCode);
}

export function ProductCard({ product }: { product: StorefrontProductCard }) {
  return (
    <article className="group relative overflow-hidden rounded-card border border-border bg-surface shadow-card transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none">
      <Link
        className="flex h-full flex-col text-foreground no-underline"
        href={`/products/${product.slug}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-strong">
          {product.image === null ? (
            <div className="grid h-full place-items-center p-5 text-center text-muted">
              <div>
                <StorefrontIcon className="mx-auto mb-3 size-9" name="package" />
                <span className="text-sm font-bold">Product image coming soon</span>
              </div>
            </div>
          ) : (
            <Image
              alt={product.image.altText}
              className="object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              src={`/api/v1/storefront/images/${product.image.id}`}
            />
          )}
          <Badge
            className="absolute top-3 left-3 shadow-sm"
            tone={product.available ? "success" : "neutral"}
          >
            {product.available ? "In stock" : "Out of stock"}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="mb-2 text-xs font-extrabold tracking-[0.1em] text-muted uppercase">
            {product.brandName ?? "ParcelMint selection"}
          </p>
          <h2 className="mb-2 break-words text-xl leading-tight sm:text-2xl">{product.name}</h2>
          <p className="mb-5 line-clamp-2 text-sm leading-6 text-muted">
            {product.description || "View product details and available variants."}
          </p>
          <div className="mt-auto flex items-end justify-between gap-4 border-t border-border pt-4">
            <div>
              <span className="block text-xs font-bold text-muted">From</span>
              <strong className="font-display text-xl text-foreground">
                {formatMoney(product.minimumPriceMinor, product.currencyCode)}
              </strong>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-extrabold text-primary">
              View product <StorefrontIcon className="size-4" name="arrow" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
