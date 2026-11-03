import type { ReactNode } from "react";

import { requirePermission } from "@/modules/auth/server/require-permission";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  await requirePermission("admin.access");

  return children;
}
