import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { inventoryItems } from "./catalog";
import { orderItems, orders } from "./commerce";

export const trackingChallengeStatus = pgEnum("tracking_challenge_status", [
  "pending",
  "verified",
  "expired",
  "locked",
]);
export const returnStatus = pgEnum("return_status", [
  "requested",
  "approved",
  "in_transit",
  "received",
  "inspected",
  "resolved",
  "rejected",
  "cancelled",
]);
export const refundMethod = pgEnum("refund_method", [
  "bank_transfer",
  "mobile_wallet",
  "cash",
  "other",
]);

export const customerProfiles = pgTable(
  "customer_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    mobileNumber: text("mobile_number"),
    email: text("email"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_profiles_mobile_unique").on(table.mobileNumber),
    check("customer_profiles_name_not_blank", sql`length(trim(${table.displayName})) > 0`),
  ],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerUserId: uuid("customer_user_id")
      .notNull()
      .references(() => customerProfiles.userId, { onDelete: "cascade" }),
    label: text("label").notNull(),
    recipientName: text("recipient_name").notNull(),
    mobileNumber: text("mobile_number").notNull(),
    deliveryArea: text("delivery_area").notNull(),
    addressLine: text("address_line").notNull(),
    landmark: text("landmark"),
    postalCode: text("postal_code"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_addresses_customer_idx").on(table.customerUserId),
    uniqueIndex("customer_addresses_default_unique")
      .on(table.customerUserId)
      .where(sql`${table.isDefault}`),
    check("customer_addresses_label_not_blank", sql`length(trim(${table.label})) > 0`),
    check("customer_addresses_recipient_not_blank", sql`length(trim(${table.recipientName})) > 0`),
    check("customer_addresses_mobile_not_blank", sql`length(trim(${table.mobileNumber})) > 0`),
    check("customer_addresses_area_not_blank", sql`length(trim(${table.deliveryArea})) > 0`),
    check("customer_addresses_line_not_blank", sql`length(trim(${table.addressLine})) > 0`),
  ],
);

export const trackingChallenges = pgTable(
  "tracking_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    verifierHash: text("verifier_hash").notNull(),
    verifierSalt: text("verifier_salt").notNull(),
    status: trackingChallengeStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maximumAttempts: integer("maximum_attempts").notNull().default(5),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tracking_challenges_expiry_idx").on(table.status, table.expiresAt),
    check("tracking_challenges_attempts_non_negative", sql`${table.attemptCount} >= 0`),
    check("tracking_challenges_max_attempts_positive", sql`${table.maximumAttempts} > 0`),
  ],
);

export const trackingSessions = pgTable(
  "tracking_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tracking_sessions_token_unique").on(table.tokenHash),
    index("tracking_sessions_order_expiry_idx").on(table.orderId, table.expiresAt),
  ],
);

export const returnRequests = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerUserId: uuid("customer_user_id").references(() => customerProfiles.userId, {
      onDelete: "set null",
    }),
    status: returnStatus("status").notNull().default("requested"),
    reason: text("reason").notNull(),
    customerNotes: text("customer_notes"),
    requestedAt: timestamp("requested_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("returns_order_status_idx").on(table.orderId, table.status),
    check("returns_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
    check(
      "returns_resolution_consistent",
      sql`(${table.status} = 'resolved' AND ${table.resolvedAt} IS NOT NULL) OR (${table.status} <> 'resolved' AND ${table.resolvedAt} IS NULL)`,
    ),
  ],
);

export const returnItems = pgTable(
  "return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returnRequests.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, {
      onDelete: "restrict",
    }),
    requestedQuantity: integer("requested_quantity").notNull(),
    approvedQuantity: integer("approved_quantity").notNull().default(0),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    sellableQuantity: integer("sellable_quantity").notNull().default(0),
  },
  (table) => [
    uniqueIndex("return_items_return_order_item_unique").on(table.returnId, table.orderItemId),
    check("return_items_requested_positive", sql`${table.requestedQuantity} > 0`),
    check(
      "return_items_quantity_bounds",
      sql`${table.approvedQuantity} >= 0 AND ${table.approvedQuantity} <= ${table.requestedQuantity} AND ${table.receivedQuantity} >= 0 AND ${table.receivedQuantity} <= ${table.approvedQuantity} AND ${table.sellableQuantity} >= 0 AND ${table.sellableQuantity} <= ${table.receivedQuantity}`,
    ),
  ],
);

export const returnEvents = pgTable(
  "return_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returnRequests.id, { onDelete: "restrict" }),
    previousStatus: returnStatus("previous_status").notNull(),
    newStatus: returnStatus("new_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("return_events_return_idx").on(table.returnId, table.occurredAt),
    check("return_events_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
    check("return_events_state_changed", sql`${table.previousStatus} <> ${table.newStatus}`),
  ],
);

export const refundRecords = pgTable(
  "refund_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returnRequests.id, { onDelete: "restrict" }),
    method: refundMethod("method").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    externalReference: text("external_reference").notNull(),
    recipientConfirmedAt: timestamp("recipient_confirmed_at", {
      mode: "date",
      withTimezone: true,
    }),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("refund_records_return_idx").on(table.returnId),
    check("refund_records_amount_positive", sql`${table.amountMinor} > 0`),
    check("refund_records_currency_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check("refund_records_reference_not_blank", sql`length(trim(${table.externalReference})) > 0`),
  ],
);
