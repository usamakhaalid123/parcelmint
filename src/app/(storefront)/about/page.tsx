import type { Metadata } from "next";

import { ContentPage } from "@/modules/storefront/components/content-page";
import { storefrontContentPages } from "@/modules/storefront/domain/content-pages";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  description: storefrontContentPages.about.description,
  title: storefrontContentPages.about.title,
};
export default function AboutPage() {
  return <ContentPage page={storefrontContentPages.about} />;
}
