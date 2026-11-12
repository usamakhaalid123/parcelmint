import type { ReactNode } from "react";
import Link from "next/link";

import { layoutStyles } from "@/components/ui";

export function StorefrontHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[rgb(247_245_239_/_95%)] backdrop-blur">
      <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-5 px-[clamp(1rem,4vw,3rem)] py-3">
        <Link className="text-xl font-black tracking-[-0.04em] no-underline" href="/">
          Parcel<span className="text-primary">Mint</span>
        </Link>
        <nav aria-label="Storefront" className="flex flex-wrap items-center justify-end gap-1">
          <Link
            className="rounded-lg px-3 py-2 font-bold no-underline hover:bg-surface"
            href="/products"
          >
            Shop
          </Link>
          <Link
            className="rounded-lg px-3 py-2 font-bold no-underline hover:bg-surface"
            href="/about"
          >
            About
          </Link>
          <Link
            className="rounded-lg px-3 py-2 font-bold no-underline hover:bg-surface"
            href="/help"
          >
            Help
          </Link>
          <Link
            className="rounded-lg px-3 py-2 font-bold no-underline hover:bg-surface"
            href="/track"
          >
            Track order
          </Link>
          <Link
            className="rounded-lg px-3 py-2 font-bold no-underline hover:bg-surface"
            href="/account"
          >
            Account
          </Link>
          <Link
            className="rounded-lg bg-primary px-3 py-2 font-bold text-white no-underline"
            href="/cart"
          >
            Cart
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--border)] bg-surface">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] gap-8 px-[clamp(1rem,4vw,3rem)] py-10 max-sm:grid-cols-1">
        <div>
          <strong className="text-lg">ParcelMint</strong>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Clear product information and accountable cash-on-delivery operations.
          </p>
        </div>
        <nav aria-label="Policies" className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Link href="/content/contact">Contact</Link>
          <Link href="/content/faq">FAQ</Link>
          <Link href="/content/shipping">Shipping</Link>
          <Link href="/content/returns">Returns</Link>
          <Link href="/content/privacy">Privacy</Link>
          <Link href="/content/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

export function StorefrontMain({ children }: { children: ReactNode }) {
  return (
    <main className={layoutStyles.storefront} id="main-content">
      {children}
    </main>
  );
}
