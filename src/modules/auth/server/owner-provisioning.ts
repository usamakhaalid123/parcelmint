import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { auditLogs, roles, userRoles, users } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AuthorizationReferenceNotFoundError } from "@/modules/auth/domain/errors";

const ownerProvisioningSchema = z.object({
  correlationId: z.string().uuid(),
  identityId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export type OwnerProvisioningInput = z.input<typeof ownerProvisioningSchema>;

export async function provisionInitialOwner(
  input: OwnerProvisioningInput,
  dependencies: {
    database?: ReturnType<typeof getDatabase>;
    verifyIdentity?: (identityId: string) => Promise<boolean>;
  } = {},
): Promise<void> {
  const values = ownerProvisioningSchema.parse(input);
  const database = dependencies.database ?? getDatabase();
  const verifyIdentity =
    dependencies.verifyIdentity ??
    (async (identityId: string) => {
      const { data, error } = await createSupabaseAdminClient().auth.admin.getUserById(identityId);
      return error === null && data.user !== null;
    });

  if (!(await verifyIdentity(values.identityId))) {
    await database.insert(auditLogs).values({
      action: "staff.owner.bootstrap",
      correlationId: values.correlationId,
      outcome: "denied",
      reason: "ProviderIdentityNotFound",
      resourceId: values.identityId,
      resourceType: "provider_identity",
    });
    throw new AuthorizationReferenceNotFoundError("user");
  }

  try {
    await database.transaction(async (transaction) => {
      await transaction
        .insert(users)
        .values({
          accountType: "staff",
          identityId: values.identityId,
          identityProvider: "supabase",
          status: "active",
        })
        .onConflictDoUpdate({
          target: [users.identityProvider, users.identityId],
          set: {
            accountType: "staff",
            status: "active",
            updatedAt: new Date(),
          },
        });

      const [applicationUser] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.identityProvider, "supabase"), eq(users.identityId, values.identityId)))
        .limit(1);
      const [ownerRole] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, "owner"))
        .limit(1);

      if (applicationUser === undefined) {
        throw new AuthorizationReferenceNotFoundError("user");
      }

      if (ownerRole === undefined) {
        throw new AuthorizationReferenceNotFoundError("role");
      }

      await transaction
        .insert(userRoles)
        .values({ roleId: ownerRole.id, userId: applicationUser.id })
        .onConflictDoNothing();

      await transaction.insert(auditLogs).values({
        action: "staff.owner.bootstrap",
        correlationId: values.correlationId,
        metadata: { roleKey: "owner" },
        outcome: "success",
        reason: values.reason,
        resourceId: applicationUser.id,
        resourceType: "user",
      });
    });
  } catch (error) {
    await database.insert(auditLogs).values({
      action: "staff.owner.bootstrap",
      correlationId: values.correlationId,
      outcome: "failure",
      reason: "OwnerBootstrapFailed",
      resourceId: values.identityId,
      resourceType: "provider_identity",
    });
    throw error;
  }
}
