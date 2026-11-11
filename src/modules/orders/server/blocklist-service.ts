import { createHash } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { auditLogs, operationalBlocks } from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth";
import { OrderAuthorizationError } from "@/modules/orders/domain/errors";

type Database = ReturnType<typeof getDatabase>;

function hashBlockValue(type: "address" | "mobile", value: string): string {
  const normalized =
    type === "mobile"
      ? value.replace(/[ -]/g, "")
      : value.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

export async function createOperationalBlock(
  input: {
    actor: StaffPrincipal | null;
    correlationId: string;
    expiresAt: Date | null;
    reason: string;
    type: "address" | "mobile";
    value: string;
  },
  database: Database = getDatabase(),
): Promise<void> {
  const values = z
    .object({
      correlationId: z.string().uuid(),
      expiresAt: z.date().nullable(),
      reason: z.string().trim().min(3).max(500),
      type: z.enum(["mobile", "address"]),
      value: z.string().trim().min(3).max(500),
    })
    .parse(input);
  const decision = authorizePermission(input.actor, "customers.blocklist");
  if (!decision.allowed) {
    await database.insert(auditLogs).values({
      action: "customer.block.create",
      actorUserId: input.actor?.userId,
      correlationId: values.correlationId,
      outcome: "denied",
      reason: decision.reason,
      resourceType: "operational_block",
    });
    throw new OrderAuthorizationError();
  }
  await database.transaction(async (transaction) => {
    const [block] = await transaction
      .insert(operationalBlocks)
      .values({
        createdByUserId: decision.principal.userId,
        expiresAt: values.expiresAt,
        reason: values.reason,
        type: values.type,
        valueHash: hashBlockValue(values.type, values.value),
      })
      .onConflictDoUpdate({
        set: { expiresAt: values.expiresAt, reason: values.reason },
        target: [operationalBlocks.type, operationalBlocks.valueHash],
      })
      .returning({ id: operationalBlocks.id });
    await transaction.insert(auditLogs).values({
      action: "customer.block.create",
      actorUserId: decision.principal.userId,
      correlationId: values.correlationId,
      outcome: "success",
      reason: values.reason,
      resourceId: block?.id,
      resourceType: "operational_block",
    });
  });
}

export async function removeOperationalBlock(
  input: {
    actor: StaffPrincipal | null;
    blockId: string;
    correlationId: string;
    reason: string;
  },
  database: Database = getDatabase(),
): Promise<void> {
  const values = z
    .object({
      blockId: z.string().uuid(),
      correlationId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500),
    })
    .parse(input);
  const decision = authorizePermission(input.actor, "customers.blocklist");
  if (!decision.allowed) {
    await database.insert(auditLogs).values({
      action: "customer.block.remove",
      actorUserId: input.actor?.userId,
      correlationId: values.correlationId,
      outcome: "denied",
      reason: decision.reason,
      resourceId: values.blockId,
      resourceType: "operational_block",
    });
    throw new OrderAuthorizationError();
  }
  await database.transaction(async (transaction) => {
    await transaction.delete(operationalBlocks).where(eq(operationalBlocks.id, values.blockId));
    await transaction.insert(auditLogs).values({
      action: "customer.block.remove",
      actorUserId: decision.principal.userId,
      correlationId: values.correlationId,
      outcome: "success",
      reason: values.reason,
      resourceId: values.blockId,
      resourceType: "operational_block",
    });
  });
}

export async function listOperationalBlocks(database: Database = getDatabase()) {
  return database.select().from(operationalBlocks).orderBy(desc(operationalBlocks.createdAt));
}
