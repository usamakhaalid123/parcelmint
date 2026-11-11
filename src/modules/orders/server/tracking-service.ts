import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { getServerEnvironment } from "@/config/env";
import {
  fulfillments,
  orderItems,
  orders,
  returnRequests,
  shipments,
  trackingChallenges,
  trackingSessions,
} from "@/db/schema";
import { consumeRateLimit } from "@/modules/checkout/server/rate-limit";

type Database = ReturnType<typeof getDatabase>;

const lookupSchema = z.object({
  mobileNumber: z.string().trim().min(7).max(30),
  orderNumber: z.string().trim().min(4).max(80),
});

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function verifierHash(code: string, salt: string): Buffer {
  return scryptSync(code, salt, 32);
}

function verifierMatches(code: string, salt: string, expectedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = verifierHash(code, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeMobile(value: string): string {
  return value.replaceAll(/[^+\d]/g, "");
}

export async function issueTrackingChallenge(
  input: z.input<typeof lookupSchema>,
  database: Database = getDatabase(),
): Promise<{ challengeId: string; developmentCode?: string }> {
  const values = lookupSchema.parse(input);
  const orderNumber = values.orderNumber.toUpperCase();
  const mobileNumber = normalizeMobile(values.mobileNumber);
  const allowed = await consumeRateLimit(
    "order_tracking_issue",
    hash(`${orderNumber}:${mobileNumber}`),
    5,
    15 * 60 * 1000,
    database,
  );
  if (!allowed) throw new Error("tracking_rate_limited");

  const [matchedOrder] = await database
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.mobileNumber, mobileNumber)))
    .limit(1);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  if (matchedOrder !== undefined) {
    await database
      .update(trackingChallenges)
      .set({ status: "expired" })
      .where(
        and(
          eq(trackingChallenges.orderId, matchedOrder.id),
          eq(trackingChallenges.status, "pending"),
        ),
      );
  }
  const [challenge] = await database
    .insert(trackingChallenges)
    .values({
      expiresAt,
      orderId: matchedOrder?.id,
      verifierHash: verifierHash(code, salt).toString("hex"),
      verifierSalt: salt,
    })
    .returning({ id: trackingChallenges.id });
  if (challenge === undefined) throw new Error("tracking_challenge_unavailable");
  return {
    challengeId: challenge.id,
    ...(getServerEnvironment().deployment === "local" ? { developmentCode: code } : {}),
  };
}

export async function verifyTrackingChallenge(
  input: { challengeId: string; code: string },
  database: Database = getDatabase(),
): Promise<{ orderNumber: string; token: string }> {
  const values = z
    .object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) })
    .parse(input);
  return database.transaction(async (transaction) => {
    const [challenge] = await transaction
      .select()
      .from(trackingChallenges)
      .where(eq(trackingChallenges.id, values.challengeId))
      .for("update")
      .limit(1);
    if (challenge === undefined || challenge.status !== "pending") {
      throw new Error("tracking_verification_failed");
    }
    const now = new Date();
    const nextAttempt = challenge.attemptCount + 1;
    const orderId = challenge.orderId;
    const valid =
      orderId !== null &&
      challenge.expiresAt > now &&
      verifierMatches(values.code, challenge.verifierSalt, challenge.verifierHash);
    if (!valid) {
      await transaction
        .update(trackingChallenges)
        .set({
          attemptCount: nextAttempt,
          status:
            challenge.expiresAt <= now
              ? "expired"
              : nextAttempt >= challenge.maximumAttempts
                ? "locked"
                : "pending",
        })
        .where(eq(trackingChallenges.id, challenge.id));
      throw new Error("tracking_verification_failed");
    }
    if (orderId === null) throw new Error("tracking_verification_failed");
    const [order] = await transaction
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (order === undefined) throw new Error("tracking_verification_failed");
    const token = randomBytes(32).toString("base64url");
    await transaction
      .update(trackingChallenges)
      .set({ attemptCount: nextAttempt, status: "verified", verifiedAt: now })
      .where(eq(trackingChallenges.id, challenge.id));
    await transaction.insert(trackingSessions).values({
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      orderId,
      tokenHash: hash(token),
    });
    return { orderNumber: order.orderNumber, token };
  });
}

export async function getTrackedOrder(
  orderNumber: string,
  token: string,
  database: Database = getDatabase(),
) {
  const now = new Date();
  const [order] = await database
    .select({
      createdAt: orders.createdAt,
      currencyCode: orders.currencyCode,
      fulfillmentState: orders.fulfillmentState,
      grandTotalMinor: orders.grandTotalMinor,
      id: orders.id,
      lifecycleState: orders.lifecycleState,
      orderNumber: orders.orderNumber,
      verificationState: orders.verificationState,
    })
    .from(orders)
    .innerJoin(
      trackingSessions,
      and(
        eq(trackingSessions.orderId, orders.id),
        eq(trackingSessions.tokenHash, hash(token)),
        gt(trackingSessions.expiresAt, now),
      ),
    )
    .where(eq(orders.orderNumber, orderNumber.toUpperCase()))
    .limit(1);
  if (order === undefined) return null;
  const [items, shipmentRows, returns] = await Promise.all([
    database.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    database
      .select({
        courierCode: shipments.courierCode,
        status: shipments.status,
        trackingNumber: shipments.trackingNumber,
      })
      .from(fulfillments)
      .leftJoin(shipments, eq(shipments.fulfillmentId, fulfillments.id))
      .where(eq(fulfillments.orderId, order.id)),
    database
      .select({
        id: returnRequests.id,
        reason: returnRequests.reason,
        requestedAt: returnRequests.requestedAt,
        status: returnRequests.status,
      })
      .from(returnRequests)
      .where(eq(returnRequests.orderId, order.id)),
  ]);
  return { items, order, returns, shipment: shipmentRows[0] ?? null };
}

export async function findTrackedOrderAccess(
  orderNumber: string,
  token: string,
  database: Database = getDatabase(),
): Promise<{ orderId: string } | null> {
  const [row] = await database
    .select({ orderId: orders.id })
    .from(orders)
    .innerJoin(
      trackingSessions,
      and(
        eq(trackingSessions.orderId, orders.id),
        eq(trackingSessions.tokenHash, hash(token)),
        gt(trackingSessions.expiresAt, new Date()),
      ),
    )
    .where(eq(orders.orderNumber, orderNumber.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export async function createCustomerTrackingSession(
  customerUserId: string,
  orderNumber: string,
  database: Database = getDatabase(),
): Promise<{ orderNumber: string; token: string }> {
  const [order] = await database
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(
      and(
        eq(orders.customerUserId, customerUserId),
        eq(orders.orderNumber, orderNumber.toUpperCase()),
      ),
    )
    .limit(1);
  if (order === undefined) throw new Error("order_access_denied");

  const token = randomBytes(32).toString("base64url");
  await database.insert(trackingSessions).values({
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    orderId: order.id,
    tokenHash: hash(token),
  });
  return { orderNumber: order.orderNumber, token };
}
