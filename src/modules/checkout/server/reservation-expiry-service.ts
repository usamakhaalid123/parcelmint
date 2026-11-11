import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { inventoryItems, inventoryReservations, orders, outboxEvents } from "@/db/schema";

type Database = ReturnType<typeof getDatabase>;

type ExpiredReservation = {
  id: string;
  inventoryItemId: string;
  orderId: string;
  quantity: number;
};

export async function releaseExpiredReservations(
  batchSize = 100,
  now = new Date(),
  database: Database = getDatabase(),
): Promise<{ released: number }> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError("batchSize must be an integer between 1 and 500");
  }

  return database.transaction(async (transaction) => {
    const claimed = await transaction.execute<ExpiredReservation>(sql`
      SELECT
        ir.id AS "id",
        ir.order_id AS "orderId",
        ir.inventory_item_id AS "inventoryItemId",
        ir.quantity AS "quantity"
      FROM inventory_reservations ir
      JOIN orders o ON o.id = ir.order_id
      WHERE ir.state = 'active'
        AND ir.expires_at <= ${now}
        AND o.verification_state = 'pending'
      ORDER BY ir.expires_at, ir.id
      FOR UPDATE OF ir SKIP LOCKED
      LIMIT ${batchSize}
    `);
    if (claimed.rows.length === 0) return { released: 0 };

    const orderIds = [...new Set(claimed.rows.map(({ orderId }) => orderId))];
    for (const reservation of claimed.rows) {
      const updated = await transaction
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
      if (updated.length === 0) {
        throw new Error("Reservation quantity exceeds the inventory reserved quantity");
      }
      await transaction
        .update(inventoryReservations)
        .set({ releasedAt: now, state: "released", updatedAt: now })
        .where(
          and(
            eq(inventoryReservations.id, reservation.id),
            eq(inventoryReservations.state, "active"),
          ),
        );
    }

    for (const orderId of orderIds) {
      const [remaining] = await transaction
        .select({ id: inventoryReservations.id })
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.orderId, orderId),
            eq(inventoryReservations.state, "active"),
          ),
        )
        .limit(1);
      if (remaining === undefined) {
        await transaction
          .update(orders)
          .set({ verificationState: "expired", updatedAt: now })
          .where(and(eq(orders.id, orderId), eq(orders.verificationState, "pending")));
        await transaction
          .insert(outboxEvents)
          .values({
            aggregateId: orderId,
            aggregateType: "order",
            idempotencyKey: `order.reservation_expired:${orderId}`,
            payload: { orderId },
            topic: "order.reservation_expired",
          })
          .onConflictDoNothing({ target: outboxEvents.idempotencyKey });
      }
    }

    return { released: claimed.rows.length };
  });
}

export async function countActiveReservationsForOrders(
  orderIds: readonly string[],
  database: Database = getDatabase(),
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const rows = await database
    .select({ id: inventoryReservations.id })
    .from(inventoryReservations)
    .where(
      and(
        inArray(inventoryReservations.orderId, [...orderIds]),
        eq(inventoryReservations.state, "active"),
      ),
    );
  return rows.length;
}
