CREATE TYPE "public"."cart_status" AS ENUM('active', 'converted', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."coupon_discount_type" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_state" AS ENUM('active', 'released', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."order_fulfillment_state" AS ENUM('unfulfilled', 'processing', 'packed', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_lifecycle_state" AS ENUM('active', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_verification_state" AS ENUM('pending', 'confirmed', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_valid" CHECK ("cart_items"."quantity" > 0 AND "cart_items"."quantity" <= 99)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid,
	"coupon_id" uuid,
	"status" "cart_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"coupon_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_key_hash" text NOT NULL,
	"discount_minor" integer NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_pk" PRIMARY KEY("coupon_id","order_id"),
	CONSTRAINT "coupon_redemptions_discount_non_negative" CHECK ("coupon_redemptions"."discount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"normalized_code" text NOT NULL,
	"discount_type" "coupon_discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"maximum_discount_minor" integer,
	"minimum_subtotal_minor" integer DEFAULT 0 NOT NULL,
	"currency_code" text,
	"usage_limit" integer,
	"per_customer_limit" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_normalized" CHECK ("coupons"."normalized_code" = upper(trim("coupons"."code"))),
	CONSTRAINT "coupons_discount_value_positive" CHECK ("coupons"."discount_value" > 0),
	CONSTRAINT "coupons_percentage_valid" CHECK ("coupons"."discount_type" <> 'percentage' OR "coupons"."discount_value" <= 10000),
	CONSTRAINT "coupons_maximum_discount_non_negative" CHECK ("coupons"."maximum_discount_minor" IS NULL OR "coupons"."maximum_discount_minor" >= 0),
	CONSTRAINT "coupons_minimum_subtotal_non_negative" CHECK ("coupons"."minimum_subtotal_minor" >= 0),
	CONSTRAINT "coupons_currency_format" CHECK ("coupons"."currency_code" IS NULL OR "coupons"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "coupons_usage_limit_positive" CHECK ("coupons"."usage_limit" IS NULL OR "coupons"."usage_limit" > 0),
	CONSTRAINT "coupons_per_customer_limit_positive" CHECK ("coupons"."per_customer_limit" IS NULL OR "coupons"."per_customer_limit" > 0),
	CONSTRAINT "coupons_date_range_valid" CHECK ("coupons"."starts_at" IS NULL OR "coupons"."ends_at" IS NULL OR "coupons"."starts_at" < "coupons"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_code_format" CHECK ("delivery_zones"."code" ~ '^[A-Z0-9_-]+$'),
	CONSTRAINT "delivery_zones_position_non_negative" CHECK ("delivery_zones"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"state" "inventory_reservation_state" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("inventory_reservations"."quantity" > 0),
	CONSTRAINT "inventory_reservations_release_consistent" CHECK (("inventory_reservations"."state" = 'released' AND "inventory_reservations"."released_at" IS NOT NULL) OR ("inventory_reservations"."state" <> 'released' AND "inventory_reservations"."released_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "order_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"address_type" text DEFAULT 'delivery' NOT NULL,
	"delivery_area" text NOT NULL,
	"address_line" text NOT NULL,
	"landmark" text,
	"postal_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_addresses_type_delivery" CHECK ("order_addresses"."address_type" = 'delivery'),
	CONSTRAINT "order_addresses_area_not_blank" CHECK (length(trim("order_addresses"."delivery_area")) > 0),
	CONSTRAINT "order_addresses_line_not_blank" CHECK (length(trim("order_addresses"."address_line")) > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_name" text NOT NULL,
	"sku" text NOT NULL,
	"selected_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"discount_allocation_minor" integer DEFAULT 0 NOT NULL,
	"tax_allocation_minor" integer DEFAULT 0 NOT NULL,
	"line_total_minor" integer NOT NULL,
	"currency_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_amounts_non_negative" CHECK ("order_items"."unit_price_minor" >= 0 AND "order_items"."discount_allocation_minor" >= 0 AND "order_items"."tax_allocation_minor" >= 0 AND "order_items"."line_total_minor" >= 0),
	CONSTRAINT "order_items_currency_format" CHECK ("order_items"."currency_code" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"cart_id" uuid,
	"delivery_zone_id" uuid,
	"customer_name" text NOT NULL,
	"mobile_number" text NOT NULL,
	"email" text,
	"delivery_instructions" text,
	"lifecycle_state" "order_lifecycle_state" DEFAULT 'active' NOT NULL,
	"verification_state" "order_verification_state" DEFAULT 'pending' NOT NULL,
	"fulfillment_state" "order_fulfillment_state" DEFAULT 'unfulfilled' NOT NULL,
	"currency_code" text NOT NULL,
	"rounding_policy" text NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"shipping_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"grand_total_minor" integer NOT NULL,
	"policy_version" text NOT NULL,
	"policy_consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_customer_name_not_blank" CHECK (length(trim("orders"."customer_name")) > 0),
	CONSTRAINT "orders_mobile_not_blank" CHECK (length(trim("orders"."mobile_number")) > 0),
	CONSTRAINT "orders_currency_format" CHECK ("orders"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_totals_non_negative" CHECK ("orders"."subtotal_minor" >= 0 AND "orders"."discount_minor" >= 0 AND "orders"."shipping_minor" >= 0 AND "orders"."tax_minor" >= 0 AND "orders"."grand_total_minor" >= 0),
	CONSTRAINT "orders_total_consistent" CHECK ("orders"."grand_total_minor" = "orders"."subtotal_minor" - "orders"."discount_minor" + "orders"."shipping_minor" + "orders"."tax_minor")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"subject_hash" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_zone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fee_minor" integer NOT NULL,
	"currency_code" text NOT NULL,
	"minimum_subtotal_minor" integer DEFAULT 0 NOT NULL,
	"maximum_subtotal_minor" integer,
	"estimated_days_min" integer NOT NULL,
	"estimated_days_max" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_rates_fee_non_negative" CHECK ("shipping_rates"."fee_minor" >= 0),
	CONSTRAINT "shipping_rates_currency_format" CHECK ("shipping_rates"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "shipping_rates_minimum_non_negative" CHECK ("shipping_rates"."minimum_subtotal_minor" >= 0),
	CONSTRAINT "shipping_rates_range_valid" CHECK ("shipping_rates"."maximum_subtotal_minor" IS NULL OR "shipping_rates"."maximum_subtotal_minor" >= "shipping_rates"."minimum_subtotal_minor"),
	CONSTRAINT "shipping_rates_days_valid" CHECK ("shipping_rates"."estimated_days_min" > 0 AND "shipping_rates"."estimated_days_max" >= "shipping_rates"."estimated_days_min")
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_variant_unique" ON "cart_items" USING btree ("cart_id","variant_id");--> statement-breakpoint
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_token_hash_unique" ON "carts" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "carts_user_status_idx" ON "carts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "carts_expiry_idx" ON "carts" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_customer_idx" ON "coupon_redemptions" USING btree ("coupon_id","customer_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_normalized_code_unique" ON "coupons" USING btree ("normalized_code");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_code_unique" ON "delivery_zones" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expiry_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_order_item_unique" ON "inventory_reservations" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_expiry_idx" ON "inventory_reservations" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "inventory_reservations_inventory_item_idx" ON "inventory_reservations" USING btree ("inventory_item_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "order_addresses_order_type_unique" ON "order_addresses" USING btree ("order_id","address_type");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_mobile_created_at_idx" ON "orders" USING btree ("mobile_number","created_at");--> statement-breakpoint
CREATE INDEX "orders_states_idx" ON "orders" USING btree ("verification_state","fulfillment_state");--> statement-breakpoint
CREATE INDEX "rate_limit_events_lookup_idx" ON "rate_limit_events" USING btree ("action","subject_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "shipping_rates_zone_active_idx" ON "shipping_rates" USING btree ("delivery_zone_id","is_active");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_commercial_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commercial snapshots are immutable'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER order_items_immutable
BEFORE UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_snapshot_mutation();--> statement-breakpoint
CREATE TRIGGER order_addresses_immutable
BEFORE UPDATE OR DELETE ON order_addresses
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_snapshot_mutation();
