import { randomUUID } from "node:crypto";

import { getDatabase } from "@/db/client";
import { decideOutboxRetry } from "@/modules/jobs/domain/retry-policy";

import {
  claimOutboxEvents,
  markOutboxEventFailed,
  markOutboxEventProcessed,
  releaseStaleOutboxLeases,
  type ClaimedOutboxEvent,
} from "./outbox-repository";

export type OutboxHandler = (event: ClaimedOutboxEvent) => Promise<void>;
export type OutboxHandlers = Readonly<Record<string, OutboxHandler>>;

export type OutboxWorkerResult = {
  claimed: number;
  deadLettered: number;
  processed: number;
  releasedStaleLeases: number;
  retried: number;
};

export async function runOutboxWorker({
  batchSize = 25,
  database = getDatabase(),
  handlers,
  now = new Date(),
  workerId = randomUUID(),
}: {
  batchSize?: number;
  database?: ReturnType<typeof getDatabase>;
  handlers: OutboxHandlers;
  now?: Date;
  workerId?: string;
}): Promise<OutboxWorkerResult> {
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  const releasedStaleLeases = await releaseStaleOutboxLeases(staleBefore, database);
  const events = await claimOutboxEvents(workerId, batchSize, database);
  const result: OutboxWorkerResult = {
    claimed: events.length,
    deadLettered: 0,
    processed: 0,
    releasedStaleLeases,
    retried: 0,
  };

  for (const event of events) {
    const handler = handlers[event.topic];

    try {
      if (handler === undefined) {
        throw new Error("No registered outbox handler");
      }

      await handler(event);
      const processed = await markOutboxEventProcessed(event.id, workerId, now, database);
      result.processed += processed ? 1 : 0;
    } catch {
      const retry = decideOutboxRetry(event.attemptCount, now);
      const updated = await markOutboxEventFailed(
        event.id,
        workerId,
        {
          ...retry,
          errorCode: handler === undefined ? "handler_not_registered" : "handler_failed",
        },
        database,
      );

      if (updated) {
        result[retry.outcome === "retry" ? "retried" : "deadLettered"] += 1;
      }
    }
  }

  return result;
}
