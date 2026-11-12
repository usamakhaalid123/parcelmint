import type { ReactNode } from "react";
import Link from "next/link";

import { layoutStyles } from "@/components/ui";
import { StorefrontIcon } from "@/modules/storefront/components/storefront-icon";

const navigation = [
  { href: "/products", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/help", label: "Help" },
  { href: "/track", label: "Track order" },
] as const;

export function StorefrontHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-18 max-w-[var(--content-width)] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-12">
        <Link
          aria-label="ParcelMint home"
          className="font-display text-xl font-extrabold tracking-[-0.04em] text-foreground no-underline sm:text-2xl"
          href="/"
        >
          Parcel<span className="text-primary">Mint</span>
        </Link>
        <nav aria-label="Storefront" className="hidden items-center gap-1 md:flex">
          {navigation.map((item) => (
            <Link
              className="rounded-lg px-3 py-2 text-sm font-bold text-muted-strong no-underline transition hover:bg-surface-strong hover:text-foreground"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
          <Link
            aria-label="Account"
            className="ml-1 grid size-11 place-items-center rounded-full border border-border bg-surface text-foreground no-underline transition hover:border-primary hover:text-primary"
            href="/account"
          >
            <StorefrontIcon className="size-5" name="account" />
          </Link>
          <Link
            className="ml-1 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white no-underline shadow-sm transition hover:bg-primary-hover"
            href="/cart"
          >
            <StorefrontIcon className="size-5" name="bag" /> Cart
          </Link>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <Link
            aria-label="Cart"
            className="grid size-11 place-items-center rounded-full bg-primary text-white no-underline shadow-sm"
            href="/cart"
          >
            <StorefrontIcon className="size-5" name="bag" />
          </Link>
          <details className="group relative">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-border bg-surface text-foreground [&::-webkit-details-marker]:hidden">
              <span className="sr-only">Open navigation</span>
              <StorefrontIcon className="size-5" name="menu" />
            </summary>
            <nav
              aria-label="Mobile storefront"
              className="absolute top-14 right-0 grid w-64 gap-1 rounded-panel border border-border bg-surface p-2 shadow-xl"
            >
              {navigation.map((item) => (
                <Link
                  className="rounded-lg px-4 py-3 font-bold text-foreground no-underline hover:bg-surface-strong"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                className="rounded-lg px-4 py-3 font-bold text-foreground no-underline hover:bg-surface-strong"
                href="/account"
              >
                Account
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-foreground text-white">
      <div className="mx-auto grid max-w-[var(--content-width)] grid-cols-[1fr_auto] gap-12 px-4 py-12 sm:px-6 lg:px-12 max-sm:grid-cols-1">
        <div>
          <strong className="font-display text-xl">ParcelMint</strong>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/65">
            Straightforward shopping, clear product information, and cash on delivery you can
            understand.
          </p>
        </div>
        <nav
          aria-label="Policies"
          className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm [&_a]:text-white/70 [&_a]:no-underline [&_a:hover]:text-white"
        >
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
