import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SkipLink } from "@/components/shared/skip-link";
import { getServerEnvironment } from "@/config/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getServerEnvironment().appUrl),
  title: {
    default: "COD Commerce",
    template: "%s | COD Commerce",
  },
  description: "A reliable cash-on-delivery commerce platform.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ParcelMint",
    url: getServerEnvironment().appUrl,
  };
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organization).replaceAll("<", "\\u003c"),
          }}
          type="application/ld+json"
        />
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
