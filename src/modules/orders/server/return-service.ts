import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  auditLogs,
  fulfillments,
  inventoryItems,
  inventoryMovements,
  inventoryReservations,
  orderItems,
  orderOperationEvents,
  orders,
  outboxEvents,
  refundRecords,
  returnEvents,
  returnItems,
  returnRequests,
  shipmentEvents,
  shipments,
} from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth";
import {
  canTransitionReturn,
  isCustomerCancellationEligible,
  isReturnRequestEligible,
  type ReturnState,
  validateReturnQuantities,
} from "@/modules/orders/domain/return-policy";
import { findTrackedOrderAccess } from "@/modules/orders/server/tracking-service";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function releaseActiveReservations(transaction: Transaction, orderId: string, now: Date) {
  const reservations = await transaction
    .select()
    .from(inventoryReservations)
    .where(
      and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.state, "active")),
    )
    .for("update");
  for (const reservation of reservations) {
    await transaction
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
      );
    await transaction
      .update(inventoryReservations)
      .set({ releasedAt: now, state: "released", updatedAt: now })
      .where(eq(inventoryReservations.id, reservation.id));
  }
}

export async function cancelTrackedOrder(
  input: { orderNumber: string; reason: string; token: string },
  database: Database = getDatabase(),
): Promise<void> {
  const values = z
    .object({
      orderNumber: z.string().trim().min(4).max(80),
      reason: z.string().trim().min(3).max(500),
      token: z.string().min(20).max(200),
    })
    .parse(input);
  const access = await findTrackedOrderAccess(values.orderNumber, values.token, database);
  if (access === null) throw new Error("order_access_denied");
  await database.transaction(async (transaction) => {
    const [order] = await transaction
      .select({
        fulfillmentState: orders.fulfillmentState,
        lifecycleState: orders.lifecycleState,
      })
      .from(orders)
      .where(eq(orders.id, access.orderId))
      .for("update")
      .limit(1);
    const [operation] = await transaction
      .select({
        fulfillmentId: fulfillments.id,
        shipmentId: shipments.id,
        shipmentState: shipments.status,
      })
      .from(fulfillments)
      .leftJoin(shipments, eq(shipments.fulfillmentId, fulfillments.id))
      .where(eq(fulfillments.orderId, access.orderId))
      .limit(1);
    if (
      order === undefined ||
      !isCustomerCancellationEligible({
        ...order,
        shipmentState: operation?.shipmentState ?? null,
      })
    ) {
      throw new Error("cancellation_not_eligible");
    }
    const now = new Date();
    await releaseActiveReservations(transaction, access.orderId, now);
    await transaction
      .update(orders)
      .set({ fulfillmentState: "cancelled", lifecycleState: "cancelled", updatedAt: now })
      .where(eq(orders.id, access.orderId));
    if (operation !== undefined) {
      await transaction
        .update(fulfillments)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(fulfillments.id, operation.fulfillmentId));
    }
    if (
      operation?.shipmentId !== null &&
      operation?.shipmentId !== undefined &&
      (operation.shipmentState === "pending" || operation.shipmentState === "label_created")
    ) {
      await transaction
        .update(shipments)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(shipments.id, operation.shipmentId));
      await transaction.insert(shipmentEvents).values({
        newStatus: "cancelled",
        previousStatus: operation.shipmentState,
        reason: values.reason,
        shipmentId: operation.shipmentId,
      });
    }
    const correlationId = randomUUID();
    await transaction.insert(orderOperationEvents).values({
      concern: "lifecycle",
      correlationId,
      newState: "cancelled",
      orderId: access.orderId,
      previousState: order.lifecycleState,
      reason: values.reason,
    });
    await transaction.insert(auditLogs).values({
      action: "order.customer_cancel",
      correlationId,
      outcome: "success",
      reason: values.reason,
      resourceId: access.orderId,
      resourceType: "order",
    });
    await transaction.insert(outboxEvents).values({
      aggregateId: access.orderId,
      aggregateType: "order",
      idempotencyKey: `order.customer_cancelled:${access.orderId}:${correlationId}`,
      payload: { orderId: access.orderId },
      topic: "order.cancelled",
    });
  });
}

export async function requestTrackedReturn(
  input: {
    customerNotes?: string;
    orderItemId: string;
    orderNumber: string;
    quantity: number;
    reason: string;
    token: string;
  },
  database: Database = getDatabase(),
): Promise<string> {
  const values = z
    .object({
      customerNotes: z.string().trim().max(1000).optional(),
      orderItemId: z.string().uuid(),
      orderNumber: z.string().trim().min(4).max(80),
      quantity: z.number().int().min(1).max(99),
      reason: z.string().trim().min(3).max(500),
      token: z.string().min(20).max(200),
    })
    .parse(input);
  const access = await findTrackedOrderAccess(values.orderNumber, values.token, database);
  if (access === null) throw new Error("order_access_denied");
  return database.transaction(async (transaction) => {
    const [orderItem] = await transaction
      .select({
        ordered: orderItems.quantity,
        variantId: orderItems.variantId,
      })
      .from(orderItems)
      .where(and(eq(orderItems.id, values.orderItemId), eq(orderItems.orderId, access.orderId)))
      .for("update")
      .limit(1);
    const [shipment] = await transaction
      .select({ deliveredAt: shipments.updatedAt, shipmentState: shipments.status })
      .from(shipments)
      .innerJoin(fulfillments, eq(fulfillments.id, shipments.fulfillmentId))
      .where(eq(fulfillments.orderId, access.orderId))
      .limit(1);
    const [inventory] =
      orderItem?.variantId === null || orderItem?.variantId === undefined
        ? []
        : await transaction
            .select({ inventoryItemId: inventoryItems.id })
            .from(inventoryItems)
            .where(eq(inventoryItems.variantId, orderItem.variantId))
            .limit(1);
    if (
      orderItem === undefined ||
      shipment?.shipmentState !== "delivered" ||
      !isReturnRequestEligible({ deliveredAt: shipment.deliveredAt, now: new Date() })
    ) {
      throw new Error("return_not_eligible");
    }
    const previous = await transaction
      .select({ quantity: returnItems.requestedQuantity, status: returnRequests.status })
      .from(returnItems)
      .innerJoin(returnRequests, eq(returnRequests.id, returnItems.returnId))
      .where(
        and(
          eq(returnRequests.orderId, access.orderId),
          eq(returnItems.orderItemId, values.orderItemId),
        ),
      );
    const alreadyRequested = previous
      .filter((entry) => entry.status !== "rejected" && entry.status !== "cancelled")
      .reduce((total, entry) => total + entry.quantity, 0);
    if (
      !validateReturnQuantities({
        alreadyRequested,
        ordered: orderItem.ordered,
        requested: values.quantity,
      })
    ) {
      throw new Error("return_quantity_invalid");
    }
    const [created] = await transaction
      .insert(returnRequests)
      .values({
        customerNotes: values.customerNotes,
        orderId: access.orderId,
        reason: values.reason,
      })
      .returning({ id: returnRequests.id });
    if (created === undefined) throw new Error("return_creation_failed");
    await transaction.insert(returnItems).values({
      inventoryItemId: inventory?.inventoryItemId,
      orderItemId: values.orderItemId,
      requestedQuantity: values.quantity,
      returnId: created.id,
    });
    await transaction.insert(auditLogs).values({
      action: "return.customer_request",
      correlationId: randomUUID(),
      outcome: "success",
      reason: values.reason,
      resourceId: created.id,
      resourceType: "return",
    });
    return created.id;
  });
}

async function requireReturnPrincipal(
  actor: StaffPrincipal | null,
  action: string,
  resourceId: string,
  database: Database,
): Promise<StaffPrincipal> {
  const decision = authorizePermission(actor, "orders.manage");
  if (!decision.allowed) {
    await database.insert(auditLogs).values({
      action,
      actorUserId: actor?.userId,
      correlationId: randomUUID(),
      outcome: "denied",
      reason: decision.reason,
      resourceId,
      resourceType: "return",
    });
    throw new Error("return_access_denied");
  }
  return decision.principal;
}

export async function transitionReturn(
  input: {
    actor: StaffPrincipal | null;
    nextState: ReturnState;
    reason: string;
    returnId: string;
    sellableQuantities?: Readonly<Record<string, number>>;
  },
  database: Database = getDatabase(),
): Promise<void> {
  const principal = await requireReturnPrincipal(
    input.actor,
    "return.transition",
    input.returnId,
    database,
  );
  const values = z
    .object({
      nextState: z.enum([
        "approved",
        "in_transit",
        "received",
        "inspected",
        "resolved",
        "rejected",
        "cancelled",
      ]),
      reason: z.string().trim().min(3).max(500),
      returnId: z.string().uuid(),
      sellableQuantities: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
    })
    .parse(input);
  await database.transaction(async (transaction) => {
    const [request] = await transaction
      .select({ status: returnRequests.status })
      .from(returnRequests)
      .where(eq(returnRequests.id, values.returnId))
      .for("update")
      .limit(1);
    if (request === undefined || !canTransitionReturn(request.status, values.nextState)) {
      throw new Error("return_transition_invalid");
    }
    const items = await transaction
      .select()
      .from(returnItems)
      .where(eq(returnItems.returnId, values.returnId))
      .for("update");
    if (values.nextState === "approved") {
      for (const item of items) {
        await transaction
          .update(returnItems)
          .set({ approvedQuantity: item.requestedQuantity })
          .where(eq(returnItems.id, item.id));
      }
    }
    if (values.nextState === "received") {
      for (const item of items) {
        await transaction
          .update(returnItems)
          .set({ receivedQuantity: item.approvedQuantity })
          .where(eq(returnItems.id, item.id));
      }
    }
    if (values.nextState === "inspected") {
      for (const item of items) {
        const sellable = values.sellableQuantities?.[item.id] ?? 0;
        if (sellable > item.receivedQuantity) throw new Error("return_disposition_invalid");
        await transaction
          .update(returnItems)
          .set({ sellableQuantity: sellable })
          .where(eq(returnItems.id, item.id));
      }
    }
    if (values.nextState === "resolved") {
      const correlationId = randomUUID();
      for (const item of items) {
        if (item.inventoryItemId === null || item.sellableQuantity === 0) continue;
        const [inventory] = await transaction
          .select({ quantity: inventoryItems.onHandQuantity })
          .from(inventoryItems)
          .where(eq(inventoryItems.id, item.inventoryItemId))
          .for("update")
          .limit(1);
        if (inventory === undefined) throw new Error("return_inventory_missing");
        await transaction
          .update(inventoryItems)
          .set({
            onHandQuantity: inventory.quantity + item.sellableQuantity,
            updatedAt: new Date(),
            version: sql`${inventoryItems.version} + 1`,
          })
          .where(eq(inventoryItems.id, item.inventoryItemId));
        await transaction.insert(inventoryMovements).values({
          actorUserId: principal.userId,
          correlationId,
          inventoryItemId: item.inventoryItemId,
          quantityAfter: inventory.quantity + item.sellableQuantity,
          quantityBefore: inventory.quantity,
          quantityDelta: item.sellableQuantity,
          reason: values.reason,
          referenceId: values.returnId,
          referenceType: "return",
          source: "return",
        });
      }
    }
    const now = new Date();
    await transaction
      .update(returnRequests)
      .set({
        resolvedAt: values.nextState === "resolved" ? now : null,
        status: values.nextState,
        updatedAt: now,
      })
      .where(eq(returnRequests.id, values.returnId));
    await transaction.insert(returnEvents).values({
      actorUserId: principal.userId,
      newStatus: values.nextState,
      previousStatus: request.status,
      reason: values.reason,
      returnId: values.returnId,
    });
    await transaction.insert(auditLogs).values({
      action: "return.transition",
      actorUserId: principal.userId,
      correlationId: randomUUID(),
      metadata: { from: request.status, to: values.nextState },
      outcome: "success",
      reason: values.reason,
      resourceId: values.returnId,
      resourceType: "return",
    });
  });
}

export async function recordOfflineRefund(
  input: {
    actor: StaffPrincipal | null;
    amountMinor: number;
    currencyCode: string;
    externalReference: string;
    method: "bank_transfer" | "cash" | "mobile_wallet" | "other";
    recipientConfirmed: boolean;
    returnId: string;
  },
  database: Database = getDatabase(),
): Promise<void> {
  const principal = await requireReturnPrincipal(
    input.actor,
    "return.refund_record",
    input.returnId,
    database,
  );
  const values = z
    .object({
      amountMinor: z.number().int().positive(),
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
      externalReference: z.string().trim().min(2).max(200),
      method: z.enum(["bank_transfer", "cash", "mobile_wallet", "other"]),
      recipientConfirmed: z.boolean(),
      returnId: z.string().uuid(),
    })
    .parse(input);
  const [request] = await database
    .select({ status: returnRequests.status })
    .from(returnRequests)
    .where(eq(returnRequests.id, values.returnId))
    .limit(1);
  if (request?.status !== "resolved") throw new Error("refund_return_unresolved");
  await database.transaction(async (transaction) => {
    await transaction.insert(refundRecords).values({
      amountMinor: values.amountMinor,
      currencyCode: values.currencyCode,
      externalReference: values.externalReference,
      method: values.method,
      recipientConfirmedAt: values.recipientConfirmed ? new Date() : null,
      recordedByUserId: principal.userId,
      returnId: values.returnId,
    });
    await transaction.insert(auditLogs).values({
      action: "return.refund_record",
      actorUserId: principal.userId,
      correlationId: randomUUID(),
      metadata: { amountMinor: values.amountMinor, currencyCode: values.currencyCode },
      outcome: "success",
      resourceId: values.returnId,
      resourceType: "return",
    });
  });
}
