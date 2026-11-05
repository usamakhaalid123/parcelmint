import Image from "next/image";
import Link from "next/link";

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
    <article className="group overflow-hidden rounded-3xl border border-[var(--border)] bg-surface shadow-[var(--shadow-card)]">
      <Link className="block no-underline" href={`/products/${product.slug}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-strong)]">
          {product.image === null ? (
            <div className="grid h-full place-items-center p-5 text-center text-sm font-bold text-[var(--muted)]">
              Product image coming soon
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
        </div>
        <div className="p-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            <span>{product.brandName ?? "ParcelMint selection"}</span>
            <span>{product.available ? "Available" : "Out of stock"}</span>
          </div>
          <h2 className="mb-2 text-2xl">{product.name}</h2>
          <p className="mb-4 line-clamp-2 text-sm text-[var(--muted)]">
            {product.description || "View product details and available variants."}
          </p>
          <strong>{formatMoney(product.minimumPriceMinor, product.currencyCode)}</strong>
        </div>
      </Link>
    </article>
  );
}
