CREATE TYPE "public"."refund_method" AS ENUM('bank_transfer', 'mobile_wallet', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('requested', 'approved', 'in_transit', 'received', 'inspected', 'resolved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tracking_challenge_status" AS ENUM('pending', 'verified', 'expired', 'locked');--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"recipient_name" text NOT NULL,
	"mobile_number" text NOT NULL,
	"delivery_area" text NOT NULL,
	"address_line" text NOT NULL,
	"landmark" text,
	"postal_code" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_addresses_label_not_blank" CHECK (length(trim("customer_addresses"."label")) > 0),
	CONSTRAINT "customer_addresses_recipient_not_blank" CHECK (length(trim("customer_addresses"."recipient_name")) > 0),
	CONSTRAINT "customer_addresses_mobile_not_blank" CHECK (length(trim("customer_addresses"."mobile_number")) > 0),
	CONSTRAINT "customer_addresses_area_not_blank" CHECK (length(trim("customer_addresses"."delivery_area")) > 0),
	CONSTRAINT "customer_addresses_line_not_blank" CHECK (length(trim("customer_addresses"."address_line")) > 0)
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"mobile_number" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_name_not_blank" CHECK (length(trim("customer_profiles"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "refund_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"method" "refund_method" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency_code" text NOT NULL,
	"external_reference" text NOT NULL,
	"recipient_confirmed_at" timestamp with time zone,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_records_amount_positive" CHECK ("refund_records"."amount_minor" > 0),
	CONSTRAINT "refund_records_currency_format" CHECK ("refund_records"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "refund_records_reference_not_blank" CHECK (length(trim("refund_records"."external_reference")) > 0)
);
--> statement-breakpoint
CREATE TABLE "return_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"previous_status" "return_status" NOT NULL,
	"new_status" "return_status" NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_events_reason_not_blank" CHECK (length(trim("return_events"."reason")) > 0),
	CONSTRAINT "return_events_state_changed" CHECK ("return_events"."previous_status" <> "return_events"."new_status")
);
--> statement-breakpoint
CREATE TABLE "return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"inventory_item_id" uuid,
	"requested_quantity" integer NOT NULL,
	"approved_quantity" integer DEFAULT 0 NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"sellable_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "return_items_requested_positive" CHECK ("return_items"."requested_quantity" > 0),
	CONSTRAINT "return_items_quantity_bounds" CHECK ("return_items"."approved_quantity" >= 0 AND "return_items"."approved_quantity" <= "return_items"."requested_quantity" AND "return_items"."received_quantity" >= 0 AND "return_items"."received_quantity" <= "return_items"."approved_quantity" AND "return_items"."sellable_quantity" >= 0 AND "return_items"."sellable_quantity" <= "return_items"."received_quantity")
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"status" "return_status" DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"customer_notes" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "returns_reason_not_blank" CHECK (length(trim("returns"."reason")) > 0),
	CONSTRAINT "returns_resolution_consistent" CHECK (("returns"."status" = 'resolved' AND "returns"."resolved_at" IS NOT NULL) OR ("returns"."status" <> 'resolved' AND "returns"."resolved_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "tracking_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"verifier_hash" text NOT NULL,
	"verifier_salt" text NOT NULL,
	"status" "tracking_challenge_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_challenges_attempts_non_negative" CHECK ("tracking_challenges"."attempt_count" >= 0),
	CONSTRAINT "tracking_challenges_max_attempts_positive" CHECK ("tracking_challenges"."maximum_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "tracking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_user_id_customer_profiles_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."customer_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_user_id_customer_profiles_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."customer_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_challenges" ADD CONSTRAINT "tracking_challenges_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_default_unique" ON "customer_addresses" USING btree ("customer_user_id") WHERE "customer_addresses"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "customer_profiles_mobile_unique" ON "customer_profiles" USING btree ("mobile_number");--> statement-breakpoint
CREATE INDEX "refund_records_return_idx" ON "refund_records" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "return_events_return_idx" ON "return_events" USING btree ("return_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "return_items_return_order_item_unique" ON "return_items" USING btree ("return_id","order_item_id");--> statement-breakpoint
CREATE INDEX "returns_order_status_idx" ON "returns" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "tracking_challenges_expiry_idx" ON "tracking_challenges" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_sessions_token_unique" ON "tracking_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "tracking_sessions_order_expiry_idx" ON "tracking_sessions" USING btree ("order_id","expires_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_created_at_idx" ON "orders" USING btree ("customer_user_id","created_at");