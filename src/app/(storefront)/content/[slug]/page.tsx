import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentPage } from "@/modules/storefront/components/content-page";
import {
  storefrontContentPages,
  type StorefrontContentSlug,
} from "@/modules/storefront/domain/content-pages";

function getPage(slug: string) {
  return Object.hasOwn(storefrontContentPages, slug)
    ? storefrontContentPages[slug as StorefrontContentSlug]
    : null;
}

export function generateStaticParams() {
  return Object.keys(storefrontContentPages).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);
  if (page === null) return { robots: { index: false }, title: "Page not found" };
  return {
    alternates: { canonical: `/content/${slug}` },
    description: page.description,
    title: page.title,
  };
}

export default async function PublicContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = getPage((await params).slug);
  if (page === null) notFound();
  return <ContentPage page={page} />;
}
