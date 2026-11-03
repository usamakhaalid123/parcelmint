import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const auditOutcome = pgEnum("audit_outcome", ["success", "denied", "failure"]);
export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "processing",
  "processed",
  "dead_letter",
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: auditOutcome("outcome").notNull(),
    reason: text("reason"),
    correlationId: uuid("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    index("audit_logs_occurred_at_idx").on(table.occurredAt),
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_logs_correlation_id_idx").on(table.correlationId),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { mode: "date", withTimezone: true }),
    lockedBy: text("locked_by"),
    processedAt: timestamp("processed_at", { mode: "date", withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("outbox_events_idempotency_key_unique").on(table.idempotencyKey),
    index("outbox_events_claim_idx").on(table.status, table.availableAt, table.createdAt),
    check("outbox_events_attempt_count_non_negative", sql`${table.attemptCount} >= 0`),
    check(
      "outbox_events_processed_state_consistent",
      sql`(${table.status} = 'processed' AND ${table.processedAt} IS NOT NULL) OR (${table.status} <> 'processed' AND ${table.processedAt} IS NULL)`,
    ),
    check(
      "outbox_events_lock_state_consistent",
      sql`(${table.status} = 'processing' AND ${table.lockedAt} IS NOT NULL AND ${table.lockedBy} IS NOT NULL) OR (${table.status} <> 'processing' AND ${table.lockedAt} IS NULL AND ${table.lockedBy} IS NULL)`,
    ),
  ],
);
