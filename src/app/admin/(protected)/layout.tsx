import type { ReactNode } from "react";
import Link from "next/link";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { signOut } from "@/modules/auth/server/sign-out";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  await requirePermission("admin.access");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 grid min-h-18 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--border)] bg-[rgb(247_245_239_/_94%)] px-[clamp(1rem,4vw,3rem)] py-3 backdrop-blur-md max-md:static max-md:grid-cols-[1fr_auto]">
        <Link className="text-lg font-black tracking-[-0.04em] no-underline" href="/admin">
          Parcel<span className="text-primary">Mint</span>
        </Link>
        <nav
          aria-label="Administration"
          className="flex gap-1 max-md:col-span-2 max-md:row-start-2 max-md:mt-2 max-md:justify-center max-md:border-t max-md:border-[var(--border)] max-md:pt-2"
        >
          <Link
            className="rounded-lg px-3 py-2 font-bold text-[var(--muted)] no-underline hover:bg-[var(--surface-strong)] hover:text-foreground"
            href="/admin"
          >
            Overview
          </Link>
          <Link
            className="rounded-lg px-3 py-2 font-bold text-[var(--muted)] no-underline hover:bg-[var(--surface-strong)] hover:text-foreground"
            href="/admin/catalog"
          >
            Catalog
          </Link>
        </nav>
        <form action={signOut} className="justify-self-end">
          <button
            className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2 font-bold text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-foreground"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
