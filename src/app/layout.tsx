import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SkipLink } from "@/components/shared/skip-link";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "COD Commerce",
    template: "%s | COD Commerce",
  },
  description: "A reliable cash-on-delivery commerce platform.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
