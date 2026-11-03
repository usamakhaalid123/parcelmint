import { redirect } from "next/navigation";

import { authorizePermission } from "@/modules/auth/domain/authorization";
import type { PermissionKey } from "@/modules/auth/domain/permission-catalog";

import { getCurrentPrincipal } from "./current-principal";

export async function requirePermission(permission: PermissionKey) {
  const decision = authorizePermission(await getCurrentPrincipal(), permission);

  if (!decision.allowed) {
    redirect("/admin/sign-in");
  }

  return decision.principal;
}
