import type { Metadata } from "next";

import { ContentPage } from "@/modules/storefront/components/content-page";
import { storefrontContentPages } from "@/modules/storefront/domain/content-pages";

export const metadata: Metadata = {
  alternates: { canonical: "/help" },
  description: storefrontContentPages.faq.description,
  title: "Help",
};
export default function HelpPage() {
  return <ContentPage page={storefrontContentPages.faq} />;
}
