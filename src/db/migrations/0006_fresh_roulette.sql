CREATE TYPE "public"."delivery_attempt_outcome" AS ENUM('failed', 'refused', 'rescheduled', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_record_status" AS ENUM('unfulfilled', 'processing', 'packed', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."operational_block_type" AS ENUM('mobile', 'address');--> statement-breakpoint
CREATE TYPE "public"."order_verification_method" AS ENUM('manual', 'otp');--> statement-breakpoint
CREATE TYPE "public"."order_verification_result" AS ENUM('confirmed', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."otp_challenge_status" AS ENUM('pending', 'verified', 'expired', 'locked');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'label_created', 'handed_to_courier', 'in_transit', 'out_for_delivery', 'delivered', 'attempt_failed', 'return_to_origin', 'returned_to_sender', 'lost', 'damaged', 'cancelled');--> statement-breakpoint
CREATE TABLE "admin_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_notes_note_not_blank" CHECK (length(trim("admin_notes"."note")) > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" "delivery_attempt_outcome" NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_attempts_number_positive" CHECK ("delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "delivery_attempts_reason_not_blank" CHECK (length(trim("delivery_attempts"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "fulfillment_items" (
	"fulfillment_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "fulfillment_items_quantity_positive" CHECK ("fulfillment_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "fulfillment_record_status" DEFAULT 'unfulfilled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" text NOT NULL,
	"provider_id" text,
	"error_code" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_attempts_number_positive" CHECK ("notification_attempts"."attempt_number" > 0),
	CONSTRAINT "notification_attempts_outcome_valid" CHECK ("notification_attempts"."outcome" IN ('sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"template_version" text NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "operational_block_type" NOT NULL,
	"value_hash" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_blocks_reason_not_blank" CHECK (length(trim("operational_blocks"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "order_operation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"concern" text NOT NULL,
	"previous_state" text NOT NULL,
	"new_state" text NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_operation_events_concern_valid" CHECK ("order_operation_events"."concern" IN ('lifecycle', 'verification', 'fulfillment', 'shipment')),
	CONSTRAINT "order_operation_events_reason_not_blank" CHECK (length(trim("order_operation_events"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "order_risk_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"code" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "order_verification_method" NOT NULL,
	"result" "order_verification_result" NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_verifications_reason_not_blank" CHECK (length(trim("order_verifications"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"verifier_hash" text NOT NULL,
	"verifier_salt" text NOT NULL,
	"status" "otp_challenge_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_attempts_non_negative" CHECK ("otp_challenges"."attempt_count" >= 0),
	CONSTRAINT "otp_challenges_maximum_attempts_positive" CHECK ("otp_challenges"."maximum_attempts" > 0),
	CONSTRAINT "otp_challenges_verified_consistent" CHECK (("otp_challenges"."status" = 'verified' AND "otp_challenges"."verified_at" IS NOT NULL) OR ("otp_challenges"."status" <> 'verified' AND "otp_challenges"."verified_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "reservation_finalizations" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"previous_status" "shipment_status" NOT NULL,
	"new_status" "shipment_status" NOT NULL,
	"actor_user_id" uuid,
	"provider_event_id" text,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_events_reason_not_blank" CHECK (length(trim("shipment_events"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fulfillment_id" uuid NOT NULL,
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"courier_code" text,
	"tracking_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "cod_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "cod_maximum_minor" integer;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "cod_minimum_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_blocks" ADD CONSTRAINT "operational_blocks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_operation_events" ADD CONSTRAINT "order_operation_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_operation_events" ADD CONSTRAINT "order_operation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_risk_flags" ADD CONSTRAINT "order_risk_flags_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_verifications" ADD CONSTRAINT "order_verifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_verifications" ADD CONSTRAINT "order_verifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_finalizations" ADD CONSTRAINT "reservation_finalizations_reservation_id_inventory_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notes_order_idx" ON "admin_notes" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempts_shipment_number_unique" ON "delivery_attempts" USING btree ("shipment_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_items_fulfillment_order_item_unique" ON "fulfillment_items" USING btree ("fulfillment_id","order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillments_order_unique" ON "fulfillments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_attempts_number_unique" ON "notification_attempts" USING btree ("notification_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_order_event_channel_unique" ON "notifications" USING btree ("order_id","event_type","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_blocks_type_value_unique" ON "operational_blocks" USING btree ("type","value_hash");--> statement-breakpoint
CREATE INDEX "operational_blocks_expiry_idx" ON "operational_blocks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "order_operation_events_order_idx" ON "order_operation_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_risk_flags_order_code_unique" ON "order_risk_flags" USING btree ("order_id","code");--> statement-breakpoint
CREATE INDEX "order_verifications_order_idx" ON "order_verifications" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_order_status_idx" ON "otp_challenges" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_idx" ON "shipment_events" USING btree ("shipment_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_events_provider_event_unique" ON "shipment_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_fulfillment_unique" ON "shipments" USING btree ("fulfillment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_courier_tracking_unique" ON "shipments" USING btree ("courier_code","tracking_number");--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_cod_minimum_non_negative" CHECK ("delivery_zones"."cod_minimum_minor" >= 0);--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_cod_range_valid" CHECK ("delivery_zones"."cod_maximum_minor" IS NULL OR "delivery_zones"."cod_maximum_minor" >= "delivery_zones"."cod_minimum_minor");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_operational_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'operational history is append-only'
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_verifications_immutable
BEFORE UPDATE OR DELETE ON order_verifications
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();
--> statement-breakpoint
CREATE TRIGGER order_operation_events_immutable
BEFORE UPDATE OR DELETE ON order_operation_events
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();
--> statement-breakpoint
CREATE TRIGGER shipment_events_immutable
BEFORE UPDATE OR DELETE ON shipment_events
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();
--> statement-breakpoint
CREATE TRIGGER delivery_attempts_immutable
BEFORE UPDATE OR DELETE ON delivery_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();
--> statement-breakpoint
CREATE TRIGGER notification_attempts_immutable
BEFORE UPDATE OR DELETE ON notification_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();
--> statement-breakpoint
CREATE TRIGGER reservation_finalizations_immutable
BEFORE UPDATE OR DELETE ON reservation_finalizations
FOR EACH ROW EXECUTE FUNCTION prevent_operational_history_mutation();
