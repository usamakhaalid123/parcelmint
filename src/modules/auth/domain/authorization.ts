import type { PermissionKey } from "./permission-catalog";

export type StaffPrincipal = {
  accountType: "customer" | "staff";
  permissionKeys: ReadonlySet<string>;
  status: "active" | "suspended";
  userId: string;
};

export type AuthorizationDecision =
  | { allowed: true; principal: StaffPrincipal }
  | {
      allowed: false;
      reason: "anonymous" | "customer_account" | "missing_permission" | "suspended";
    };

export function authorizePermission(
  principal: StaffPrincipal | null,
  permission: PermissionKey,
): AuthorizationDecision {
  if (principal === null) {
    return { allowed: false, reason: "anonymous" };
  }

  if (principal.status !== "active") {
    return { allowed: false, reason: "suspended" };
  }

  if (principal.accountType !== "staff") {
    return { allowed: false, reason: "customer_account" };
  }

  if (!principal.permissionKeys.has(permission)) {
    return { allowed: false, reason: "missing_permission" };
  }

  return { allowed: true, principal };
}
