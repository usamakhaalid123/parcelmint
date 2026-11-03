import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { outboxEvents } from "@/db/schema";

export type ClaimedOutboxEvent = {
  aggregateId: string;
  aggregateType: string;
  attemptCount: number;
  id: string;
  payload: unknown;
  topic: string;
};

export async function claimOutboxEvents(
  workerId: string,
  batchSize: number,
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<readonly ClaimedOutboxEvent[]> {
  if (workerId.trim().length === 0) {
    throw new RangeError("workerId must not be empty");
  }

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError("batchSize must be an integer between 1 and 100");
  }

  const result = await database.execute<ClaimedOutboxEvent>(sql`
    WITH claimable AS (
      SELECT ${outboxEvents.id}
      FROM ${outboxEvents}
      WHERE ${outboxEvents.status} = 'pending'
        AND ${outboxEvents.availableAt} <= now()
      ORDER BY ${outboxEvents.availableAt}, ${outboxEvents.createdAt}
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE ${outboxEvents}
    SET
      status = 'processing',
      locked_at = now(),
      locked_by = ${workerId},
      attempt_count = ${outboxEvents.attemptCount} + 1
    FROM claimable
    WHERE ${outboxEvents.id} = claimable.id
    RETURNING
      ${outboxEvents.id} AS "id",
      ${outboxEvents.topic} AS "topic",
      ${outboxEvents.aggregateType} AS "aggregateType",
      ${outboxEvents.aggregateId} AS "aggregateId",
      ${outboxEvents.payload} AS "payload",
      ${outboxEvents.attemptCount} AS "attemptCount"
  `);

  return result.rows;
}

export async function markOutboxEventProcessed(
  eventId: string,
  workerId: string,
  processedAt = new Date(),
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<boolean> {
  const [processed] = await database
    .update(outboxEvents)
    .set({
      lockedAt: null,
      lockedBy: null,
      processedAt,
      status: "processed",
    })
    .where(
      and(
        eq(outboxEvents.id, eventId),
        eq(outboxEvents.status, "processing"),
        eq(outboxEvents.lockedBy, workerId),
      ),
    )
    .returning({ id: outboxEvents.id });

  return processed !== undefined;
}

export async function markOutboxEventFailed(
  eventId: string,
  workerId: string,
  failure: { errorCode: string } & (
    { availableAt: Date; outcome: "retry" } | { outcome: "dead_letter" }
  ),
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<boolean> {
  const [updated] = await database
    .update(outboxEvents)
    .set(
      failure.outcome === "retry"
        ? {
            availableAt: failure.availableAt,
            lastErrorCode: failure.errorCode,
            lockedAt: null,
            lockedBy: null,
            status: "pending",
          }
        : {
            lastErrorCode: failure.errorCode,
            lockedAt: null,
            lockedBy: null,
            status: "dead_letter",
          },
    )
    .where(
      and(
        eq(outboxEvents.id, eventId),
        eq(outboxEvents.status, "processing"),
        eq(outboxEvents.lockedBy, workerId),
      ),
    )
    .returning({ id: outboxEvents.id });

  return updated !== undefined;
}

export async function releaseStaleOutboxLeases(
  staleBefore: Date,
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<number> {
  const released = await database
    .update(outboxEvents)
    .set({
      availableAt: new Date(),
      lastErrorCode: "lease_expired",
      lockedAt: null,
      lockedBy: null,
      status: "pending",
    })
    .where(
      and(eq(outboxEvents.status, "processing"), sql`${outboxEvents.lockedAt} < ${staleBefore}`),
    )
    .returning({ id: outboxEvents.id });

  return released.length;
}
