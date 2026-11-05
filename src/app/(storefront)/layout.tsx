import type { ReactNode } from "react";

import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/modules/storefront/components/storefront-shell";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <StorefrontHeader />
      {children}
      <StorefrontFooter />
    </div>
  );
}
