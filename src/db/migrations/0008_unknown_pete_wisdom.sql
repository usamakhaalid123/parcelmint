CREATE TYPE "public"."cod_cash_state" AS ENUM('not_due', 'collection_due', 'collected_by_courier', 'remittance_pending', 'reconciled', 'collection_failed', 'disputed', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."cod_discrepancy_status" AS ENUM('open', 'resolved', 'written_off');--> statement-breakpoint
CREATE TABLE "cod_cash_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"previous_state" "cod_cash_state" NOT NULL,
	"new_state" "cod_cash_state" NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cod_cash_events_reason_not_blank" CHECK (length(trim("cod_cash_events"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "cod_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"state" "cod_cash_state" DEFAULT 'not_due' NOT NULL,
	"expected_amount_minor" integer NOT NULL,
	"collected_amount_minor" integer,
	"currency_code" text NOT NULL,
	"courier_reference" text,
	"collected_at" timestamp with time zone,
	"remittance_batch" text,
	"remittance_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cod_collections_expected_non_negative" CHECK ("cod_collections"."expected_amount_minor" >= 0),
	CONSTRAINT "cod_collections_collected_non_negative" CHECK ("cod_collections"."collected_amount_minor" IS NULL OR "cod_collections"."collected_amount_minor" >= 0),
	CONSTRAINT "cod_collections_currency_format" CHECK ("cod_collections"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "cod_collections_collection_details_consistent" CHECK (("cod_collections"."collected_amount_minor" IS NULL AND "cod_collections"."collected_at" IS NULL AND "cod_collections"."courier_reference" IS NULL) OR ("cod_collections"."collected_amount_minor" IS NOT NULL AND "cod_collections"."collected_at" IS NOT NULL AND length(trim("cod_collections"."courier_reference")) > 0))
);
--> statement-breakpoint
CREATE TABLE "cod_discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"expected_amount_minor" integer NOT NULL,
	"actual_amount_minor" integer NOT NULL,
	"difference_minor" integer NOT NULL,
	"currency_code" text NOT NULL,
	"status" "cod_discrepancy_status" DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"resolved_by_user_id" uuid,
	"resolution_reason" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cod_discrepancies_expected_non_negative" CHECK ("cod_discrepancies"."expected_amount_minor" >= 0),
	CONSTRAINT "cod_discrepancies_actual_non_negative" CHECK ("cod_discrepancies"."actual_amount_minor" >= 0),
	CONSTRAINT "cod_discrepancies_difference_consistent" CHECK ("cod_discrepancies"."difference_minor" = "cod_discrepancies"."actual_amount_minor" - "cod_discrepancies"."expected_amount_minor"),
	CONSTRAINT "cod_discrepancies_currency_format" CHECK ("cod_discrepancies"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "cod_discrepancies_reason_not_blank" CHECK (length(trim("cod_discrepancies"."reason")) > 0),
	CONSTRAINT "cod_discrepancies_resolution_consistent" CHECK (("cod_discrepancies"."status" = 'open' AND "cod_discrepancies"."resolved_at" IS NULL AND "cod_discrepancies"."resolved_by_user_id" IS NULL AND "cod_discrepancies"."resolution_reason" IS NULL) OR ("cod_discrepancies"."status" <> 'open' AND "cod_discrepancies"."resolved_at" IS NOT NULL AND "cod_discrepancies"."resolved_by_user_id" IS NOT NULL AND length(trim("cod_discrepancies"."resolution_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "cod_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"reconciled_amount_minor" integer NOT NULL,
	"currency_code" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cod_reconciliations_amount_non_negative" CHECK ("cod_reconciliations"."reconciled_amount_minor" >= 0),
	CONSTRAINT "cod_reconciliations_currency_format" CHECK ("cod_reconciliations"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "cod_reconciliations_reason_not_blank" CHECK (length(trim("cod_reconciliations"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "cod_cash_events" ADD CONSTRAINT "cod_cash_events_collection_id_cod_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cod_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_cash_events" ADD CONSTRAINT "cod_cash_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_discrepancies" ADD CONSTRAINT "cod_discrepancies_collection_id_cod_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cod_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_discrepancies" ADD CONSTRAINT "cod_discrepancies_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_reconciliations" ADD CONSTRAINT "cod_reconciliations_collection_id_cod_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cod_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_reconciliations" ADD CONSTRAINT "cod_reconciliations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "cod_collections" ("order_id", "state", "expected_amount_minor", "currency_code")
SELECT
	"orders"."id",
	CASE WHEN EXISTS (
		SELECT 1
		FROM "fulfillments"
		INNER JOIN "shipments" ON "shipments"."fulfillment_id" = "fulfillments"."id"
		WHERE "fulfillments"."order_id" = "orders"."id" AND "shipments"."status" = 'delivered'
	) THEN 'collection_due'::"cod_cash_state" ELSE 'not_due'::"cod_cash_state" END,
	"orders"."grand_total_minor",
	"orders"."currency_code"
FROM "orders";--> statement-breakpoint
INSERT INTO "cod_cash_events" ("collection_id", "previous_state", "new_state", "reason", "correlation_id")
SELECT "id", 'not_due', 'collection_due', 'Backfilled from delivered shipment during Phase 7 migration', gen_random_uuid()
FROM "cod_collections"
WHERE "state" = 'collection_due';--> statement-breakpoint
CREATE TRIGGER cod_cash_events_immutable
BEFORE UPDATE OR DELETE ON cod_cash_events
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();--> statement-breakpoint
CREATE TRIGGER cod_reconciliations_immutable
BEFORE UPDATE OR DELETE ON cod_reconciliations
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();--> statement-breakpoint
CREATE INDEX "cod_cash_events_collection_idx" ON "cod_cash_events" USING btree ("collection_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_collections_order_unique" ON "cod_collections" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cod_collections_state_idx" ON "cod_collections" USING btree ("state","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_discrepancies_collection_unique" ON "cod_discrepancies" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "cod_discrepancies_status_idx" ON "cod_discrepancies" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_reconciliations_collection_unique" ON "cod_reconciliations" USING btree ("collection_id");
