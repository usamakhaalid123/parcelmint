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
import { inventoryReservations, orderItems, orders } from "./commerce";

export const orderVerificationMethod = pgEnum("order_verification_method", ["manual", "otp"]);
export const orderVerificationResult = pgEnum("order_verification_result", [
  "confirmed",
  "rejected",
  "expired",
]);
export const otpChallengeStatus = pgEnum("otp_challenge_status", [
  "pending",
  "verified",
  "expired",
  "locked",
]);
export const fulfillmentRecordStatus = pgEnum("fulfillment_record_status", [
  "unfulfilled",
  "processing",
  "packed",
  "fulfilled",
  "cancelled",
]);
export const shipmentStatus = pgEnum("shipment_status", [
  "pending",
  "label_created",
  "handed_to_courier",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "attempt_failed",
  "return_to_origin",
  "returned_to_sender",
  "lost",
  "damaged",
  "cancelled",
]);
export const deliveryAttemptOutcome = pgEnum("delivery_attempt_outcome", [
  "failed",
  "refused",
  "rescheduled",
  "delivered",
]);
export const notificationStatus = pgEnum("notification_status", ["pending", "sent", "failed"]);
export const notificationChannel = pgEnum("notification_channel", ["email", "sms", "whatsapp"]);
export const operationalBlockType = pgEnum("operational_block_type", ["mobile", "address"]);

export const orderVerifications = pgTable(
  "order_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    method: orderVerificationMethod("method").notNull(),
    result: orderVerificationResult("result").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("order_verifications_order_idx").on(table.orderId, table.occurredAt),
    check("order_verifications_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    verifierHash: text("verifier_hash").notNull(),
    verifierSalt: text("verifier_salt").notNull(),
    status: otpChallengeStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maximumAttempts: integer("maximum_attempts").notNull().default(5),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("otp_challenges_order_status_idx").on(table.orderId, table.status),
    check("otp_challenges_attempts_non_negative", sql`${table.attemptCount} >= 0`),
    check("otp_challenges_maximum_attempts_positive", sql`${table.maximumAttempts} > 0`),
    check(
      "otp_challenges_verified_consistent",
      sql`(${table.status} = 'verified' AND ${table.verifiedAt} IS NOT NULL) OR (${table.status} <> 'verified' AND ${table.verifiedAt} IS NULL)`,
    ),
  ],
);

export const fulfillments = pgTable(
  "fulfillments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    status: fulfillmentRecordStatus("status").notNull().default("unfulfilled"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("fulfillments_order_unique").on(table.orderId)],
);

export const fulfillmentItems = pgTable(
  "fulfillment_items",
  {
    fulfillmentId: uuid("fulfillment_id")
      .notNull()
      .references(() => fulfillments.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    uniqueIndex("fulfillment_items_fulfillment_order_item_unique").on(
      table.fulfillmentId,
      table.orderItemId,
    ),
    check("fulfillment_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const orderOperationEvents = pgTable(
  "order_operation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    concern: text("concern").notNull(),
    previousState: text("previous_state").notNull(),
    newState: text("new_state").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("order_operation_events_order_idx").on(table.orderId, table.occurredAt),
    check(
      "order_operation_events_concern_valid",
      sql`${table.concern} IN ('lifecycle', 'verification', 'fulfillment', 'shipment')`,
    ),
    check("order_operation_events_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fulfillmentId: uuid("fulfillment_id")
      .notNull()
      .references(() => fulfillments.id, { onDelete: "restrict" }),
    status: shipmentStatus("status").notNull().default("pending"),
    courierCode: text("courier_code"),
    trackingNumber: text("tracking_number"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shipments_fulfillment_unique").on(table.fulfillmentId),
    uniqueIndex("shipments_courier_tracking_unique").on(table.courierCode, table.trackingNumber),
  ],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "restrict" }),
    previousStatus: shipmentStatus("previous_status").notNull(),
    newStatus: shipmentStatus("new_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    providerEventId: text("provider_event_id"),
    reason: text("reason").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shipment_events_shipment_idx").on(table.shipmentId, table.occurredAt),
    uniqueIndex("shipment_events_provider_event_unique").on(table.providerEventId),
    check("shipment_events_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    outcome: deliveryAttemptOutcome("outcome").notNull(),
    reason: text("reason").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("delivery_attempts_shipment_number_unique").on(
      table.shipmentId,
      table.attemptNumber,
    ),
    check("delivery_attempts_number_positive", sql`${table.attemptNumber} > 0`),
    check("delivery_attempts_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const operationalBlocks = pgTable(
  "operational_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: operationalBlockType("type").notNull(),
    valueHash: text("value_hash").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("operational_blocks_type_value_unique").on(table.type, table.valueHash),
    index("operational_blocks_expiry_idx").on(table.expiresAt),
    check("operational_blocks_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const orderRiskFlags = pgTable(
  "order_risk_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("order_risk_flags_order_code_unique").on(table.orderId, table.code)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    channel: notificationChannel("channel").notNull(),
    templateVersion: text("template_version").notNull(),
    status: notificationStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("notifications_order_event_channel_unique").on(
      table.orderId,
      table.eventType,
      table.channel,
    ),
  ],
);

export const notificationAttempts = pgTable(
  "notification_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    outcome: text("outcome").notNull(),
    providerId: text("provider_id"),
    errorCode: text("error_code"),
    attemptedAt: timestamp("attempted_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("notification_attempts_number_unique").on(
      table.notificationId,
      table.attemptNumber,
    ),
    check("notification_attempts_number_positive", sql`${table.attemptNumber} > 0`),
    check("notification_attempts_outcome_valid", sql`${table.outcome} IN ('sent', 'failed')`),
  ],
);

export const adminNotes = pgTable(
  "admin_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("admin_notes_order_idx").on(table.orderId, table.createdAt),
    check("admin_notes_note_not_blank", sql`length(trim(${table.note})) > 0`),
  ],
);

export const reservationFinalizations = pgTable("reservation_finalizations", {
  reservationId: uuid("reservation_id")
    .primaryKey()
    .references(() => inventoryReservations.id, { onDelete: "restrict" }),
  finalizedAt: timestamp("finalized_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});
