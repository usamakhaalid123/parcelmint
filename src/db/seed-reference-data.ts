import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { permissions, rolePermissions, roles } from "@/db/schema";
import {
  permissionCatalog,
  systemRoleCatalog,
  systemRolePermissions,
} from "@/modules/auth/domain/permission-catalog";

export async function seedAuthorizationReferenceData(
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<void> {
  await database.transaction(async (transaction) => {
    for (const permission of permissionCatalog) {
      await transaction
        .insert(permissions)
        .values(permission)
        .onConflictDoUpdate({
          target: permissions.key,
          set: { description: permission.description },
        });
    }

    for (const role of systemRoleCatalog) {
      await transaction
        .insert(roles)
        .values({ ...role, isSystem: true })
        .onConflictDoUpdate({
          target: roles.key,
          set: {
            description: role.description,
            isSystem: true,
            name: role.name,
            updatedAt: new Date(),
          },
        });

      const [persistedRole] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, role.key))
        .limit(1);

      if (persistedRole === undefined) {
        throw new Error(`System role was not persisted: ${role.key}`);
      }

      await transaction.delete(rolePermissions).where(eq(rolePermissions.roleId, persistedRole.id));

      const grants = systemRolePermissions[role.key].map((permissionKey) => ({
        permissionKey,
        roleId: persistedRole.id,
      }));

      if (grants.length > 0) {
        await transaction.insert(rolePermissions).values(grants);
      }
    }
  });
}
