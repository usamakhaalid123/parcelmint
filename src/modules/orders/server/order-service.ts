import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  adminNotes,
  auditLogs,
  deliveryAttempts,
  fulfillmentItems,
  fulfillments,
  inventoryItems,
  inventoryMovements,
  inventoryReservations,
  orderAddresses,
  orderItems,
  orderOperationEvents,
  orderRiskFlags,
  orders,
  orderVerifications,
  outboxEvents,
  reservationFinalizations,
  shipmentEvents,
  shipments,
} from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth";
import {
  OrderAuthorizationError,
  OrderNotFoundError,
  OrderTransitionError,
} from "@/modules/orders/domain/errors";
import {
  canTransitionFulfillment,
  canTransitionShipment,
  canTransitionVerification,
  type FulfillmentState,
  type ShipmentState,
} from "@/modules/orders/domain/state-policy";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const operationInputSchema = z.object({
  correlationId: z.string().uuid(),
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

type OperationInput = z.input<typeof operationInputSchema> & { actor: StaffPrincipal | null };

async function deny(
  input: OperationInput,
  action: string,
  database: Database,
  reason: string,
): Promise<never> {
  await database.insert(auditLogs).values({
    action,
    actorUserId: input.actor?.userId,
    correlationId: input.correlationId,
    outcome: "denied",
    reason,
    resourceId: input.orderId,
    resourceType: "order",
  });
  throw new OrderAuthorizationError();
}

async function authorizeOrderOperation(
  input: OperationInput,
  action: string,
  database: Database,
  permission: "orders.manage" | "orders.cancel_after_shipment" = "orders.manage",
) {
  const decision = authorizePermission(input.actor, permission);
  if (!decision.allowed) return deny(input, action, database, decision.reason);
  return decision.principal;
}

async function recordOperation(
  transaction: Transaction,
  input: {
    action: string;
    actorUserId: string;
    concern: "fulfillment" | "lifecycle" | "shipment" | "verification";
    correlationId: string;
    newState: string;
    orderId: string;
    previousState: string;
    reason: string;
  },
) {
  await transaction.insert(orderOperationEvents).values({
    actorUserId: input.actorUserId,
    concern: input.concern,
    correlationId: input.correlationId,
    newState: input.newState,
    orderId: input.orderId,
    previousState: input.previousState,
    reason: input.reason,
  });
  await transaction.insert(auditLogs).values({
    action: input.action,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    metadata: { newState: input.newState, previousState: input.previousState },
    outcome: "success",
    reason: input.reason,
    resourceId: input.orderId,
    resourceType: "order",
  });
}

async function enqueueOrderEvent(
  transaction: Transaction,
  orderId: string,
  topic: string,
  correlationId: string,
) {
  await transaction.insert(outboxEvents).values({
    aggregateId: orderId,
    aggregateType: "order",
    idempotencyKey: `${topic}:${orderId}:${correlationId}`,
    payload: { orderId },
    topic,
  });
}

async function releaseReservations(transaction: Transaction, orderId: string, now: Date) {
  const reservations = await transaction
    .select({
      id: inventoryReservations.id,
      inventoryItemId: inventoryReservations.inventoryItemId,
      quantity: inventoryReservations.quantity,
    })
    .from(inventoryReservations)
    .where(
      and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.state, "active")),
    )
    .for("update");

  for (const reservation of reservations) {
    const released = await transaction
      .update(inventoryItems)
      .set({
        reservedQuantity: sql`${inventoryItems.reservedQuantity} - ${reservation.quantity}`,
        updatedAt: now,
        version: sql`${inventoryItems.version} + 1`,
      })
      .where(
        and(
          eq(inventoryItems.id, reservation.inventoryItemId),
          sql`${inventoryItems.reservedQuantity} >= ${reservation.quantity}`,
        ),
      )
      .returning({ id: inventoryItems.id });
    if (released.length === 0) throw new OrderTransitionError("reservation_unavailable");
    await transaction
      .update(inventoryReservations)
      .set({ releasedAt: now, state: "released", updatedAt: now })
      .where(eq(inventoryReservations.id, reservation.id));
  }
}

export async function confirmOrderManually(
  input: OperationInput,
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema.parse(input);
  const principal = await authorizeOrderOperation(input, "order.verification.confirm", database);
  await database.transaction(async (transaction) => {
    const [order] = await transaction
      .select({ lifecycle: orders.lifecycleState, state: orders.verificationState })
      .from(orders)
      .where(eq(orders.id, values.orderId))
      .for("update")
      .limit(1);
    if (order === undefined) throw new OrderNotFoundError();
    if (order.lifecycle !== "active" || !canTransitionVerification(order.state, "confirmed")) {
      throw new OrderTransitionError("invalid_transition");
    }
    const now = new Date();
    await transaction
      .update(orders)
      .set({ updatedAt: now, verificationState: "confirmed" })
      .where(eq(orders.id, values.orderId));
    await transaction
      .update(inventoryReservations)
      .set({ expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), updatedAt: now })
      .where(
        and(
          eq(inventoryReservations.orderId, values.orderId),
          eq(inventoryReservations.state, "active"),
        ),
      );
    await transaction.insert(orderVerifications).values({
      actorUserId: principal.userId,
      method: "manual",
      orderId: values.orderId,
      reason: values.reason,
      result: "confirmed",
    });
    const [fulfillment] = await transaction
      .insert(fulfillments)
      .values({ orderId: values.orderId })
      .returning({ id: fulfillments.id });
    if (fulfillment === undefined) throw new Error("Fulfillment creation did not return a row");
    const items = await transaction
      .select({ orderItemId: orderItems.id, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, values.orderId));
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
    await recordOperation(transaction, {
      action: "order.verification.confirm",
      actorUserId: principal.userId,
      concern: "verification",
      correlationId: values.correlationId,
      newState: "confirmed",
      orderId: values.orderId,
      previousState: order.state,
      reason: values.reason,
    });
    await enqueueOrderEvent(transaction, values.orderId, "order.confirmed", values.correlationId);
  });
}

export async function rejectOrder(
  input: OperationInput,
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema.parse(input);
  const principal = await authorizeOrderOperation(input, "order.verification.reject", database);
  await database.transaction(async (transaction) => {
    const [order] = await transaction
      .select({ lifecycle: orders.lifecycleState, verification: orders.verificationState })
      .from(orders)
      .where(eq(orders.id, values.orderId))
      .for("update")
      .limit(1);
    if (order === undefined) throw new OrderNotFoundError();
    if (!canTransitionVerification(order.verification, "rejected")) {
      throw new OrderTransitionError("invalid_transition");
    }
    const now = new Date();
    await releaseReservations(transaction, values.orderId, now);
    await transaction
      .update(orders)
      .set({
        fulfillmentState: "cancelled",
        lifecycleState: "cancelled",
        updatedAt: now,
        verificationState: "rejected",
      })
      .where(eq(orders.id, values.orderId));
    await transaction.insert(orderVerifications).values({
      actorUserId: principal.userId,
      method: "manual",
      orderId: values.orderId,
      reason: values.reason,
      result: "rejected",
    });
    await recordOperation(transaction, {
      action: "order.verification.reject",
      actorUserId: principal.userId,
      concern: "verification",
      correlationId: values.correlationId,
      newState: "rejected",
      orderId: values.orderId,
      previousState: order.verification,
      reason: values.reason,
    });
    await recordOperation(transaction, {
      action: "order.lifecycle.cancel",
      actorUserId: principal.userId,
      concern: "lifecycle",
      correlationId: values.correlationId,
      newState: "cancelled",
      orderId: values.orderId,
      previousState: order.lifecycle,
      reason: values.reason,
    });
    await enqueueOrderEvent(
      transaction,
      values.orderId,
      "order.verification_rejected",
      values.correlationId,
    );
  });
}

export async function transitionFulfillment(
  input: OperationInput & { nextState: "packed" | "processing" },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema
    .extend({ nextState: z.enum(["processing", "packed"]) })
    .parse(input);
  const principal = await authorizeOrderOperation(input, "order.fulfillment.transition", database);
  await database.transaction(async (transaction) => {
    const [row] = await transaction
      .select({
        fulfillmentId: fulfillments.id,
        fulfillmentState: orders.fulfillmentState,
        recordState: fulfillments.status,
        verificationState: orders.verificationState,
      })
      .from(orders)
      .innerJoin(fulfillments, eq(fulfillments.orderId, orders.id))
      .where(eq(orders.id, values.orderId))
      .for("update")
      .limit(1);
    if (row === undefined) throw new OrderNotFoundError();
    if (
      row.verificationState !== "confirmed" ||
      row.fulfillmentState !== row.recordState ||
      !canTransitionFulfillment(row.fulfillmentState, values.nextState)
    ) {
      throw new OrderTransitionError("invalid_transition");
    }
    const now = new Date();
    await transaction
      .update(orders)
      .set({ fulfillmentState: values.nextState, updatedAt: now })
      .where(eq(orders.id, values.orderId));
    await transaction
      .update(fulfillments)
      .set({ status: values.nextState, updatedAt: now })
      .where(eq(fulfillments.id, row.fulfillmentId));
    await recordOperation(transaction, {
      action: `order.fulfillment.${values.nextState}`,
      actorUserId: principal.userId,
      concern: "fulfillment",
      correlationId: values.correlationId,
      newState: values.nextState,
      orderId: values.orderId,
      previousState: row.fulfillmentState,
      reason: values.reason,
    });
  });
}

export async function createShipmentLabel(
  input: OperationInput & { courierCode: string; trackingNumber: string },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema
    .extend({
      courierCode: z.string().trim().min(2).max(80),
      trackingNumber: z.string().trim().min(2).max(120),
    })
    .parse(input);
  const principal = await authorizeOrderOperation(input, "order.shipment.label", database);
  await database.transaction(async (transaction) => {
    const [shipment] = await transaction
      .select({ id: shipments.id, status: shipments.status })
      .from(shipments)
      .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
      .where(eq(fulfillments.orderId, values.orderId))
      .for("update")
      .limit(1);
    if (shipment === undefined) throw new OrderNotFoundError();
    if (!canTransitionShipment(shipment.status, "label_created")) {
      throw new OrderTransitionError("invalid_transition");
    }
    await transaction
      .update(shipments)
      .set({
        courierCode: values.courierCode,
        status: "label_created",
        trackingNumber: values.trackingNumber,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));
    await transaction.insert(shipmentEvents).values({
      actorUserId: principal.userId,
      newStatus: "label_created",
      previousStatus: shipment.status,
      reason: values.reason,
      shipmentId: shipment.id,
    });
    await recordOperation(transaction, {
      action: "order.shipment.label",
      actorUserId: principal.userId,
      concern: "shipment",
      correlationId: values.correlationId,
      newState: "label_created",
      orderId: values.orderId,
      previousState: shipment.status,
      reason: values.reason,
    });
  });
}

export async function handoffOrder(
  input: OperationInput,
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema.parse(input);
  const principal = await authorizeOrderOperation(input, "order.fulfillment.handoff", database);
  await database.transaction(async (transaction) => {
    const [row] = await transaction
      .select({
        fulfillmentId: fulfillments.id,
        fulfillmentState: orders.fulfillmentState,
        shipmentId: shipments.id,
        shipmentState: shipments.status,
      })
      .from(orders)
      .innerJoin(fulfillments, eq(fulfillments.orderId, orders.id))
      .innerJoin(shipments, eq(shipments.fulfillmentId, fulfillments.id))
      .where(eq(orders.id, values.orderId))
      .for("update")
      .limit(1);
    if (row === undefined) throw new OrderNotFoundError();
    if (
      !canTransitionFulfillment(row.fulfillmentState, "fulfilled") ||
      !canTransitionShipment(row.shipmentState, "handed_to_courier")
    ) {
      throw new OrderTransitionError("invalid_transition");
    }
    const reservations = await transaction
      .select({
        id: inventoryReservations.id,
        inventoryItemId: inventoryReservations.inventoryItemId,
        quantity: inventoryReservations.quantity,
      })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.orderId, values.orderId),
          eq(inventoryReservations.state, "active"),
        ),
      )
      .for("update");
    const now = new Date();
    for (const reservation of reservations) {
      const [inventory] = await transaction
        .select({
          onHand: inventoryItems.onHandQuantity,
          reserved: inventoryItems.reservedQuantity,
        })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, reservation.inventoryItemId))
        .for("update")
        .limit(1);
      if (
        inventory === undefined ||
        inventory.onHand < reservation.quantity ||
        inventory.reserved < reservation.quantity
      ) {
        throw new OrderTransitionError("reservation_unavailable");
      }
      await transaction
        .update(inventoryItems)
        .set({
          onHandQuantity: inventory.onHand - reservation.quantity,
          reservedQuantity: inventory.reserved - reservation.quantity,
          updatedAt: now,
          version: sql`${inventoryItems.version} + 1`,
        })
        .where(eq(inventoryItems.id, reservation.inventoryItemId));
      await transaction.insert(inventoryMovements).values({
        actorUserId: principal.userId,
        correlationId: values.correlationId,
        inventoryItemId: reservation.inventoryItemId,
        quantityAfter: inventory.onHand - reservation.quantity,
        quantityBefore: inventory.onHand,
        quantityDelta: -reservation.quantity,
        reason: values.reason,
        referenceId: values.orderId,
        referenceType: "order",
        source: "fulfillment",
      });
      await transaction
        .update(inventoryReservations)
        .set({ state: "consumed", updatedAt: now })
        .where(eq(inventoryReservations.id, reservation.id));
      await transaction.insert(reservationFinalizations).values({
        finalizedAt: now,
        reservationId: reservation.id,
      });
    }
    await transaction
      .update(orders)
      .set({ fulfillmentState: "fulfilled", updatedAt: now })
      .where(eq(orders.id, values.orderId));
    await transaction
      .update(fulfillments)
      .set({ status: "fulfilled", updatedAt: now })
      .where(eq(fulfillments.id, row.fulfillmentId));
    await transaction
      .update(shipments)
      .set({ status: "handed_to_courier", updatedAt: now })
      .where(eq(shipments.id, row.shipmentId));
    await transaction.insert(shipmentEvents).values({
      actorUserId: principal.userId,
      newStatus: "handed_to_courier",
      previousStatus: row.shipmentState,
      reason: values.reason,
      shipmentId: row.shipmentId,
    });
    await recordOperation(transaction, {
      action: "order.fulfillment.handoff",
      actorUserId: principal.userId,
      concern: "fulfillment",
      correlationId: values.correlationId,
      newState: "fulfilled",
      orderId: values.orderId,
      previousState: row.fulfillmentState,
      reason: values.reason,
    });
    await recordOperation(transaction, {
      action: "order.shipment.handoff",
      actorUserId: principal.userId,
      concern: "shipment",
      correlationId: values.correlationId,
      newState: "handed_to_courier",
      orderId: values.orderId,
      previousState: row.shipmentState,
      reason: values.reason,
    });
    await enqueueOrderEvent(transaction, values.orderId, "order.shipped", values.correlationId);
  });
}

export async function transitionShipment(
  input: OperationInput & { nextState: ShipmentState; providerEventId?: string },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema
    .extend({
      nextState: z.enum([
        "in_transit",
        "out_for_delivery",
        "delivered",
        "attempt_failed",
        "return_to_origin",
        "returned_to_sender",
        "lost",
        "damaged",
      ]),
      providerEventId: z.string().trim().min(1).max(200).optional(),
    })
    .parse(input);
  const principal = await authorizeOrderOperation(input, "order.shipment.transition", database);
  await database.transaction(async (transaction) => {
    if (values.providerEventId !== undefined) {
      const [duplicate] = await transaction
        .select({ id: shipmentEvents.id })
        .from(shipmentEvents)
        .where(eq(shipmentEvents.providerEventId, values.providerEventId))
        .limit(1);
      if (duplicate !== undefined) return;
    }
    const [shipment] = await transaction
      .select({ id: shipments.id, status: shipments.status })
      .from(shipments)
      .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
      .where(eq(fulfillments.orderId, values.orderId))
      .for("update")
      .limit(1);
    if (shipment === undefined) throw new OrderNotFoundError();
    const nextState = values.nextState;
    if (!canTransitionShipment(shipment.status, nextState)) {
      throw new OrderTransitionError("invalid_transition");
    }
    await transaction
      .update(shipments)
      .set({ status: nextState, updatedAt: new Date() })
      .where(eq(shipments.id, shipment.id));
    await transaction.insert(shipmentEvents).values({
      actorUserId: principal.userId,
      newStatus: nextState,
      previousStatus: shipment.status,
      providerEventId: values.providerEventId,
      reason: values.reason,
      shipmentId: shipment.id,
    });
    await recordOperation(transaction, {
      action: "order.shipment.transition",
      actorUserId: principal.userId,
      concern: "shipment",
      correlationId: values.correlationId,
      newState: nextState,
      orderId: values.orderId,
      previousState: shipment.status,
      reason: values.reason,
    });
    const topic =
      nextState === "delivered"
        ? "order.delivered"
        : nextState === "out_for_delivery"
          ? "order.out_for_delivery"
          : nextState === "attempt_failed"
            ? "order.delivery_failed"
            : null;
    if (topic !== null)
      await enqueueOrderEvent(transaction, values.orderId, topic, values.correlationId);
  });
}

export async function applyCourierEvent(
  input: {
    courierCode: string;
    nextState: Exclude<
      ShipmentState,
      "cancelled" | "handed_to_courier" | "label_created" | "pending"
    >;
    providerEventId: string;
    reason: string;
    trackingNumber: string;
  },
  database: Database = getDatabase(),
): Promise<{ duplicate: boolean; orderId: string }> {
  const values = z
    .object({
      courierCode: z.string().trim().min(2).max(80),
      nextState: z.enum([
        "in_transit",
        "out_for_delivery",
        "delivered",
        "attempt_failed",
        "return_to_origin",
        "returned_to_sender",
        "lost",
        "damaged",
      ]),
      providerEventId: z.string().trim().min(1).max(200),
      reason: z.string().trim().min(3).max(500),
      trackingNumber: z.string().trim().min(2).max(120),
    })
    .parse(input);
  return database.transaction(async (transaction) => {
    const [duplicate] = await transaction
      .select({ orderId: fulfillments.orderId })
      .from(shipmentEvents)
      .innerJoin(shipments, eq(shipments.id, shipmentEvents.shipmentId))
      .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
      .where(eq(shipmentEvents.providerEventId, values.providerEventId))
      .limit(1);
    if (duplicate !== undefined) return { duplicate: true, orderId: duplicate.orderId };

    const [shipment] = await transaction
      .select({ id: shipments.id, orderId: fulfillments.orderId, status: shipments.status })
      .from(shipments)
      .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
      .where(
        and(
          eq(shipments.courierCode, values.courierCode),
          eq(shipments.trackingNumber, values.trackingNumber),
        ),
      )
      .for("update")
      .limit(1);
    if (shipment === undefined) throw new OrderNotFoundError();
    if (!canTransitionShipment(shipment.status, values.nextState)) {
      throw new OrderTransitionError("invalid_transition");
    }
    const correlationId = randomUUID();
    await transaction
      .update(shipments)
      .set({ status: values.nextState, updatedAt: new Date() })
      .where(eq(shipments.id, shipment.id));
    await transaction.insert(shipmentEvents).values({
      newStatus: values.nextState,
      previousStatus: shipment.status,
      providerEventId: values.providerEventId,
      reason: values.reason,
      shipmentId: shipment.id,
    });
    await transaction.insert(orderOperationEvents).values({
      concern: "shipment",
      correlationId,
      newState: values.nextState,
      orderId: shipment.orderId,
      previousState: shipment.status,
      reason: values.reason,
    });
    await transaction.insert(auditLogs).values({
      action: "order.shipment.provider_transition",
      correlationId,
      metadata: { courierCode: values.courierCode, providerEventId: values.providerEventId },
      outcome: "success",
      reason: values.reason,
      resourceId: shipment.orderId,
      resourceType: "order",
    });
    const topic =
      values.nextState === "delivered"
        ? "order.delivered"
        : values.nextState === "out_for_delivery"
          ? "order.out_for_delivery"
          : values.nextState === "attempt_failed"
            ? "order.delivery_failed"
            : null;
    if (topic !== null) {
      await enqueueOrderEvent(transaction, shipment.orderId, topic, correlationId);
    }
    return { duplicate: false, orderId: shipment.orderId };
  });
}

export async function recordDeliveryAttempt(
  input: OperationInput & { outcome: "delivered" | "failed" | "refused" | "rescheduled" },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema
    .extend({ outcome: z.enum(["delivered", "failed", "refused", "rescheduled"]) })
    .parse(input);
  await authorizeOrderOperation(input, "order.delivery_attempt.record", database);
  await database.transaction(async (transaction) => {
    const [shipment] = await transaction
      .select({ id: shipments.id })
      .from(shipments)
      .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
      .where(eq(fulfillments.orderId, values.orderId))
      .for("update")
      .limit(1);
    if (shipment === undefined) throw new OrderNotFoundError();
    const [attempts] = await transaction
      .select({ value: count() })
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.shipmentId, shipment.id));
    await transaction.insert(deliveryAttempts).values({
      attemptNumber: (attempts?.value ?? 0) + 1,
      outcome: values.outcome,
      reason: values.reason,
      shipmentId: shipment.id,
    });
  });
}

export async function cancelOrder(
  input: OperationInput,
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema.parse(input);
  const basePrincipal = await authorizeOrderOperation(input, "order.cancel", database);
  const [current] = await database
    .select({ fulfillment: orders.fulfillmentState })
    .from(orders)
    .where(eq(orders.id, values.orderId))
    .limit(1);
  if (current === undefined) throw new OrderNotFoundError();
  const principal =
    current.fulfillment === "fulfilled"
      ? await authorizeOrderOperation(
          input,
          "order.cancel_after_shipment",
          database,
          "orders.cancel_after_shipment",
        )
      : basePrincipal;
  await database.transaction(async (transaction) => {
    const [order] = await transaction
      .select({ fulfillment: orders.fulfillmentState, lifecycle: orders.lifecycleState })
      .from(orders)
      .where(eq(orders.id, values.orderId))
      .for("update")
      .limit(1);
    if (order === undefined) throw new OrderNotFoundError();
    if (order.lifecycle !== "active" || order.fulfillment === "cancelled") {
      throw new OrderTransitionError("invalid_transition");
    }
    const now = new Date();
    if (order.fulfillment !== "fulfilled")
      await releaseReservations(transaction, values.orderId, now);
    await transaction
      .update(orders)
      .set({
        fulfillmentState: order.fulfillment === "fulfilled" ? "fulfilled" : "cancelled",
        lifecycleState: "cancelled",
        updatedAt: now,
      })
      .where(eq(orders.id, values.orderId));
    if (order.fulfillment !== "fulfilled") {
      await transaction
        .update(fulfillments)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(fulfillments.orderId, values.orderId));
      const [shipment] = await transaction
        .select({ id: shipments.id, status: shipments.status })
        .from(shipments)
        .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
        .where(eq(fulfillments.orderId, values.orderId))
        .for("update")
        .limit(1);
      if (
        shipment !== undefined &&
        (shipment.status === "pending" || shipment.status === "label_created")
      ) {
        await transaction
          .update(shipments)
          .set({ status: "cancelled", updatedAt: now })
          .where(eq(shipments.id, shipment.id));
        await transaction.insert(shipmentEvents).values({
          actorUserId: principal.userId,
          newStatus: "cancelled",
          previousStatus: shipment.status,
          reason: values.reason,
          shipmentId: shipment.id,
        });
        await recordOperation(transaction, {
          action: "order.shipment.cancel",
          actorUserId: principal.userId,
          concern: "shipment",
          correlationId: values.correlationId,
          newState: "cancelled",
          orderId: values.orderId,
          previousState: shipment.status,
          reason: values.reason,
        });
      }
    }
    await recordOperation(transaction, {
      action: "order.cancel",
      actorUserId: principal.userId,
      concern: "lifecycle",
      correlationId: values.correlationId,
      newState: "cancelled",
      orderId: values.orderId,
      previousState: order.lifecycle,
      reason: values.reason,
    });
    await enqueueOrderEvent(transaction, values.orderId, "order.cancelled", values.correlationId);
  });
}

export async function addAdminNote(
  input: OperationInput & { note: string },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationInputSchema
    .omit({ reason: true })
    .extend({ note: z.string().trim().min(2).max(2_000) })
    .parse(input);
  const principal = await authorizeOrderOperation(input, "order.note.add", database);
  await database.transaction(async (transaction) => {
    await transaction.insert(adminNotes).values({
      actorUserId: principal.userId,
      note: values.note,
      orderId: values.orderId,
    });
    await transaction.insert(auditLogs).values({
      action: "order.note.add",
      actorUserId: principal.userId,
      correlationId: values.correlationId,
      outcome: "success",
      resourceId: values.orderId,
      resourceType: "order",
    });
  });
}

export type AdminOrderSummary = {
  createdAt: Date;
  currencyCode: string;
  fulfillmentState: FulfillmentState;
  grandTotalMinor: number;
  id: string;
  orderNumber: string;
  verificationState: "confirmed" | "expired" | "pending" | "rejected";
};

export async function listAdminOrders(
  database: Database = getDatabase(),
): Promise<readonly AdminOrderSummary[]> {
  return database
    .select({
      createdAt: orders.createdAt,
      currencyCode: orders.currencyCode,
      fulfillmentState: orders.fulfillmentState,
      grandTotalMinor: orders.grandTotalMinor,
      id: orders.id,
      orderNumber: orders.orderNumber,
      verificationState: orders.verificationState,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(100);
}

export async function getAdminOrder(orderId: string, database: Database = getDatabase()) {
  const [order] = await database.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (order === undefined) return null;
  const [items, addresses, events, notes, riskFlags, fulfillmentRows] = await Promise.all([
    database
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.createdAt)),
    database.select().from(orderAddresses).where(eq(orderAddresses.orderId, orderId)),
    database
      .select()
      .from(orderOperationEvents)
      .where(eq(orderOperationEvents.orderId, orderId))
      .orderBy(desc(orderOperationEvents.occurredAt)),
    database
      .select()
      .from(adminNotes)
      .where(eq(adminNotes.orderId, orderId))
      .orderBy(desc(adminNotes.createdAt)),
    database.select().from(orderRiskFlags).where(eq(orderRiskFlags.orderId, orderId)),
    database
      .select({
        fulfillmentId: fulfillments.id,
        shipmentId: shipments.id,
        shipmentStatus: shipments.status,
        courierCode: shipments.courierCode,
        trackingNumber: shipments.trackingNumber,
      })
      .from(fulfillments)
      .leftJoin(shipments, eq(shipments.fulfillmentId, fulfillments.id))
      .where(eq(fulfillments.orderId, orderId)),
  ]);
  return {
    addresses,
    events,
    fulfillment: fulfillmentRows[0] ?? null,
    items,
    notes,
    order,
    riskFlags,
  };
}
