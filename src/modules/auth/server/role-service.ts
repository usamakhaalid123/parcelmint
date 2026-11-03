import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { auditLogs, roles, userRoles, users } from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth/domain/authorization";
import {
  AuthorizationDeniedError,
  AuthorizationReferenceNotFoundError,
} from "@/modules/auth/domain/errors";

const roleAssignmentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  roleKey: z.string().trim().min(1).max(100),
  targetUserId: z.string().uuid(),
});

export type AssignRoleInput = z.input<typeof roleAssignmentSchema> & {
  actor: StaffPrincipal | null;
  correlationId: string;
};

export async function assignRole(
  input: AssignRoleInput,
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<void> {
  const values = roleAssignmentSchema.parse(input);
  const correlationId = z.string().uuid().parse(input.correlationId);
  const decision = authorizePermission(input.actor, "staff.manage");

  if (!decision.allowed) {
    await database.insert(auditLogs).values({
      action: "staff.role.assign",
      actorUserId: input.actor?.userId,
      correlationId,
      metadata: { roleKey: values.roleKey },
      outcome: "denied",
      reason: decision.reason,
      resourceId: values.targetUserId,
      resourceType: "user",
    });
    throw new AuthorizationDeniedError();
  }

  try {
    await database.transaction(async (transaction) => {
      const [targetUser] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, values.targetUserId))
        .limit(1);

      if (targetUser === undefined) {
        throw new AuthorizationReferenceNotFoundError("user");
      }

      const [role] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.key, values.roleKey), eq(roles.isSystem, true)))
        .limit(1);

      if (role === undefined) {
        throw new AuthorizationReferenceNotFoundError("role");
      }

      await transaction
        .insert(userRoles)
        .values({
          assignedByUserId: decision.principal.userId,
          roleId: role.id,
          userId: targetUser.id,
        })
        .onConflictDoNothing();

      await transaction.insert(auditLogs).values({
        action: "staff.role.assign",
        actorUserId: decision.principal.userId,
        correlationId,
        metadata: { roleKey: values.roleKey },
        outcome: "success",
        reason: values.reason,
        resourceId: targetUser.id,
        resourceType: "user",
      });
    });
  } catch (error) {
    await database.insert(auditLogs).values({
      action: "staff.role.assign",
      actorUserId: decision.principal.userId,
      correlationId,
      metadata: { roleKey: values.roleKey },
      outcome: "failure",
      reason:
        error instanceof AuthorizationReferenceNotFoundError ? error.name : "RoleAssignmentFailed",
      resourceId: values.targetUserId,
      resourceType: "user",
    });
    throw error;
  }
}
