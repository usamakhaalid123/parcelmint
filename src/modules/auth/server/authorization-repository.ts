import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { permissions, rolePermissions, roles, userRoles, users } from "@/db/schema";
import type { StaffPrincipal } from "@/modules/auth/domain/authorization";

export async function findPrincipalByIdentityId(
  identityId: string,
): Promise<StaffPrincipal | null> {
  const database = getDatabase();
  const rows = await database
    .select({
      accountType: users.accountType,
      permissionKey: permissions.key,
      status: users.status,
      userId: users.id,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.key, rolePermissions.permissionKey))
    .where(and(eq(users.identityProvider, "supabase"), eq(users.identityId, identityId)));

  const firstRow = rows[0];

  if (firstRow === undefined) {
    return null;
  }

  return {
    accountType: firstRow.accountType,
    permissionKeys: new Set(
      rows.flatMap((row) => (row.permissionKey === null ? [] : [row.permissionKey])),
    ),
    status: firstRow.status,
    userId: firstRow.userId,
  };
}
