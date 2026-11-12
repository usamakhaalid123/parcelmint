import { sql } from "drizzle-orm";
import {
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
import { orders } from "./commerce";

export const codCashState = pgEnum("cod_cash_state", [
  "not_due",
  "collection_due",
  "collected_by_courier",
  "remittance_pending",
  "reconciled",
  "collection_failed",
  "disputed",
  "written_off",
]);

export const codDiscrepancyStatus = pgEnum("cod_discrepancy_status", [
  "open",
  "resolved",
  "written_off",
]);

export const codCollections = pgTable(
  "cod_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    state: codCashState("state").notNull().default("not_due"),
    expectedAmountMinor: integer("expected_amount_minor").notNull(),
    collectedAmountMinor: integer("collected_amount_minor"),
    currencyCode: text("currency_code").notNull(),
    courierReference: text("courier_reference"),
    collectedAt: timestamp("collected_at", { mode: "date", withTimezone: true }),
    remittanceBatch: text("remittance_batch"),
    remittanceRecordedAt: timestamp("remittance_recorded_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cod_collections_order_unique").on(table.orderId),
    index("cod_collections_state_idx").on(table.state, table.updatedAt),
    check("cod_collections_expected_non_negative", sql`${table.expectedAmountMinor} >= 0`),
    check(
      "cod_collections_collected_non_negative",
      sql`${table.collectedAmountMinor} IS NULL OR ${table.collectedAmountMinor} >= 0`,
    ),
    check("cod_collections_currency_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check(
      "cod_collections_collection_details_consistent",
      sql`(${table.collectedAmountMinor} IS NULL AND ${table.collectedAt} IS NULL AND ${table.courierReference} IS NULL) OR (${table.collectedAmountMinor} IS NOT NULL AND ${table.collectedAt} IS NOT NULL AND length(trim(${table.courierReference})) > 0)`,
    ),
  ],
);

export const codCashEvents = pgTable(
  "cod_cash_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => codCollections.id, { onDelete: "restrict" }),
    previousState: codCashState("previous_state").notNull(),
    newState: codCashState("new_state").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("cod_cash_events_collection_idx").on(table.collectionId, table.occurredAt),
    check("cod_cash_events_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const codReconciliations = pgTable(
  "cod_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => codCollections.id, { onDelete: "restrict" }),
    reconciledAmountMinor: integer("reconciled_amount_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    reconciledAt: timestamp("reconciled_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cod_reconciliations_collection_unique").on(table.collectionId),
    check("cod_reconciliations_amount_non_negative", sql`${table.reconciledAmountMinor} >= 0`),
    check("cod_reconciliations_currency_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check("cod_reconciliations_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const codDiscrepancies = pgTable(
  "cod_discrepancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => codCollections.id, { onDelete: "restrict" }),
    expectedAmountMinor: integer("expected_amount_minor").notNull(),
    actualAmountMinor: integer("actual_amount_minor").notNull(),
    differenceMinor: integer("difference_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    status: codDiscrepancyStatus("status").notNull().default("open"),
    reason: text("reason").notNull(),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolutionReason: text("resolution_reason"),
    resolvedAt: timestamp("resolved_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cod_discrepancies_collection_unique").on(table.collectionId),
    index("cod_discrepancies_status_idx").on(table.status, table.createdAt),
    check("cod_discrepancies_expected_non_negative", sql`${table.expectedAmountMinor} >= 0`),
    check("cod_discrepancies_actual_non_negative", sql`${table.actualAmountMinor} >= 0`),
    check(
      "cod_discrepancies_difference_consistent",
      sql`${table.differenceMinor} = ${table.actualAmountMinor} - ${table.expectedAmountMinor}`,
    ),
    check("cod_discrepancies_currency_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check("cod_discrepancies_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
    check(
      "cod_discrepancies_resolution_consistent",
      sql`(${table.status} = 'open' AND ${table.resolvedAt} IS NULL AND ${table.resolvedByUserId} IS NULL AND ${table.resolutionReason} IS NULL) OR (${table.status} <> 'open' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedByUserId} IS NOT NULL AND length(trim(${table.resolutionReason})) > 0)`,
    ),
  ],
);
