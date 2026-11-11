import { randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  auditLogs,
  fulfillmentItems,
  fulfillments,
  inventoryReservations,
  orderItems,
  orderOperationEvents,
  orders,
  orderVerifications,
  otpChallenges,
  outboxEvents,
  shipments,
} from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth";
import { OrderAuthorizationError, OrderTransitionError } from "@/modules/orders/domain/errors";

type Database = ReturnType<typeof getDatabase>;

function otpHash(code: string, salt: string): string {
  return scryptSync(code, salt, 32).toString("hex");
}

function otpMatches(code: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(otpHash(code, salt), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function issueOrderOtp(
  input: { actor: StaffPrincipal | null; correlationId: string; orderId: string },
  database: Database = getDatabase(),
): Promise<{ challengeId: string; code: string; expiresAt: Date }> {
  const values = z
    .object({ correlationId: z.string().uuid(), orderId: z.string().uuid() })
    .parse(input);
  const decision = authorizePermission(input.actor, "orders.manage");
  if (!decision.allowed) {
    await database.insert(auditLogs).values({
      action: "order.verification.otp_issue",
      actorUserId: input.actor?.userId,
      correlationId: values.correlationId,
      outcome: "denied",
      reason: decision.reason,
      resourceId: values.orderId,
      resourceType: "order",
    });
    throw new OrderAuthorizationError();
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  return database.transaction(async (transaction) => {
    const [order] = await transaction
      .select({
        lifecycleState: orders.lifecycleState,
        verificationState: orders.verificationState,
      })
      .from(orders)
      .where(eq(orders.id, values.orderId))
      .for("update")
      .limit(1);
    if (order?.lifecycleState !== "active" || order.verificationState !== "pending") {
      throw new OrderTransitionError("invalid_transition");
    }
    await transaction
      .update(otpChallenges)
      .set({ status: "expired" })
      .where(and(eq(otpChallenges.orderId, values.orderId), eq(otpChallenges.status, "pending")));
    const [challenge] = await transaction
      .insert(otpChallenges)
      .values({
        expiresAt,
        orderId: values.orderId,
        verifierHash: otpHash(code, salt),
        verifierSalt: salt,
      })
      .returning({ id: otpChallenges.id });
    if (challenge === undefined) throw new Error("OTP challenge creation did not return a row");
    await transaction.insert(auditLogs).values({
      action: "order.verification.otp_issue",
      actorUserId: decision.principal.userId,
      correlationId: values.correlationId,
      outcome: "success",
      resourceId: values.orderId,
      resourceType: "order",
    });
    return { challengeId: challenge.id, code, expiresAt };
  });
}

export async function verifyOrderOtp(
  input: { challengeId: string; code: string; correlationId: string },
  database: Database = getDatabase(),
): Promise<{ orderId: string }> {
  const values = z
    .object({
      challengeId: z.string().uuid(),
      code: z.string().regex(/^\d{6}$/),
      correlationId: z.string().uuid(),
    })
    .parse(input);
  const result = await database.transaction(async (transaction) => {
    const [challenge] = await transaction
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.id, values.challengeId))
      .for("update")
      .limit(1);
    if (challenge === undefined || challenge.status !== "pending") {
      throw new OrderTransitionError("invalid_transition");
    }
    const now = new Date();
    if (challenge.expiresAt <= now) {
      await transaction
        .update(otpChallenges)
        .set({ status: "expired" })
        .where(eq(otpChallenges.id, challenge.id));
      return { confirmed: false as const };
    }
    const nextAttempt = challenge.attemptCount + 1;
    if (!otpMatches(values.code, challenge.verifierSalt, challenge.verifierHash)) {
      await transaction
        .update(otpChallenges)
        .set({
          attemptCount: nextAttempt,
          status: nextAttempt >= challenge.maximumAttempts ? "locked" : "pending",
        })
        .where(eq(otpChallenges.id, challenge.id));
      return { confirmed: false as const };
    }

    const [order] = await transaction
      .select({ lifecycle: orders.lifecycleState, state: orders.verificationState })
      .from(orders)
      .where(eq(orders.id, challenge.orderId))
      .for("update")
      .limit(1);
    if (order?.lifecycle !== "active" || order.state !== "pending") {
      throw new OrderTransitionError("invalid_transition");
    }
    await transaction
      .update(otpChallenges)
      .set({ attemptCount: nextAttempt, status: "verified", verifiedAt: now })
      .where(eq(otpChallenges.id, challenge.id));
    await transaction
      .update(orders)
      .set({ updatedAt: now, verificationState: "confirmed" })
      .where(eq(orders.id, challenge.orderId));
    await transaction
      .update(inventoryReservations)
      .set({ expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), updatedAt: now })
      .where(
        and(
          eq(inventoryReservations.orderId, challenge.orderId),
          eq(inventoryReservations.state, "active"),
        ),
      );
    await transaction.insert(orderVerifications).values({
      method: "otp",
      orderId: challenge.orderId,
      reason: "Customer completed the OTP challenge",
      result: "confirmed",
    });
    const [fulfillment] = await transaction
      .insert(fulfillments)
      .values({ orderId: challenge.orderId })
      .returning({ id: fulfillments.id });
    if (fulfillment === undefined) throw new Error("Fulfillment creation did not return a row");
    const items = await transaction
      .select({ orderItemId: orderItems.id, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, challenge.orderId));
    if (items.length > 0) {
      await transaction.insert(fulfillmentItems).values(
        items.map((item) => ({
          fulfillmentId: fulfillment.id,
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      );
    }
    await transaction.insert(shipments).values({ fulfillmentId: fulfillment.id });
    await transaction.insert(orderOperationEvents).values({
      concern: "verification",
      correlationId: values.correlationId,
      newState: "confirmed",
      orderId: challenge.orderId,
      previousState: "pending",
      reason: "Customer completed the OTP challenge",
    });
    await transaction.insert(auditLogs).values({
      action: "order.verification.otp_confirm",
      correlationId: values.correlationId,
      outcome: "success",
      resourceId: challenge.orderId,
      resourceType: "order",
    });
    await transaction.insert(outboxEvents).values({
      aggregateId: challenge.orderId,
      aggregateType: "order",
      idempotencyKey: `order.confirmed:${challenge.orderId}:${values.correlationId}`,
      payload: { orderId: challenge.orderId },
      topic: "order.confirmed",
    });
    return { confirmed: true as const, orderId: challenge.orderId };
  });
  if (!result.confirmed) throw new OrderTransitionError("invalid_transition");
  return { orderId: result.orderId };
}
