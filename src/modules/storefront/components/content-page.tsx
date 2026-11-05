import Link from "next/link";

import type { StorefrontContentPage } from "@/modules/storefront/domain/content-pages";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export function ContentPage({ page }: { page: StorefrontContentPage }) {
  return (
    <StorefrontMain>
      <article className="mx-auto max-w-3xl py-[clamp(4rem,10vw,8rem)]">
        <p className="eyebrow">Information</p>
        <h1 className="max-w-3xl!">{page.title}</h1>
        <p className="mb-12 text-xl text-[var(--muted)]">{page.description}</p>
        <div className="grid gap-8">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl">{section.heading}</h2>
              <p className="text-[var(--muted)]">{section.body}</p>
            </section>
          ))}
        </div>
        <Link className="primary-action mt-12" href="/products">
          Browse products
        </Link>
      </article>
    </StorefrontMain>
  );
}
