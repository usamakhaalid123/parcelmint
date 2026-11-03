CREATE TYPE "public"."inventory_movement_source" AS ENUM('initial', 'adjustment', 'csv_import', 'return', 'reservation_release', 'fulfillment');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."variant_stock_behavior" AS ENUM('tracked', 'untracked');--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_format" CHECK ("brands"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_format" CHECK ("categories"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "categories_not_own_parent" CHECK ("categories"."parent_id" IS NULL OR "categories"."parent_id" <> "categories"."id"),
	CONSTRAINT "categories_position_non_negative" CHECK ("categories"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"on_hand_quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_on_hand_non_negative" CHECK ("inventory_items"."on_hand_quantity" >= 0),
	CONSTRAINT "inventory_items_reserved_non_negative" CHECK ("inventory_items"."reserved_quantity" >= 0),
	CONSTRAINT "inventory_items_reserved_not_over_on_hand" CHECK ("inventory_items"."reserved_quantity" <= "inventory_items"."on_hand_quantity"),
	CONSTRAINT "inventory_items_low_stock_non_negative" CHECK ("inventory_items"."low_stock_threshold" >= 0),
	CONSTRAINT "inventory_items_version_positive" CHECK ("inventory_items"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"source" "inventory_movement_source" NOT NULL,
	"quantity_before" integer NOT NULL,
	"quantity_delta" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"reason" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_delta_non_zero" CHECK ("inventory_movements"."quantity_delta" <> 0),
	CONSTRAINT "inventory_movements_before_non_negative" CHECK ("inventory_movements"."quantity_before" >= 0),
	CONSTRAINT "inventory_movements_after_non_negative" CHECK ("inventory_movements"."quantity_after" >= 0),
	CONSTRAINT "inventory_movements_quantity_consistent" CHECK ("inventory_movements"."quantity_after" = "inventory_movements"."quantity_before" + "inventory_movements"."quantity_delta"),
	CONSTRAINT "inventory_movements_reason_not_blank" CHECK (length(trim("inventory_movements"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "product_categories_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"storage_key" text NOT NULL,
	"alt_text" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_position_non_negative" CHECK ("product_images"."position" >= 0),
	CONSTRAINT "product_images_storage_key_not_blank" CHECK (length(trim("product_images"."storage_key")) > 0),
	CONSTRAINT "product_images_alt_text_not_blank" CHECK (length(trim("product_images"."alt_text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_options_position_non_negative" CHECK ("product_options"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sku" text NOT NULL,
	"normalized_sku" text NOT NULL,
	"price_override_minor" integer,
	"stock_behavior" "variant_stock_behavior" DEFAULT 'tracked' NOT NULL,
	"weight_grams" integer,
	"length_millimeters" integer,
	"width_millimeters" integer,
	"height_millimeters" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_normalized" CHECK ("product_variants"."normalized_sku" = upper(trim("product_variants"."sku"))),
	CONSTRAINT "product_variants_price_override_non_negative" CHECK ("product_variants"."price_override_minor" IS NULL OR "product_variants"."price_override_minor" >= 0),
	CONSTRAINT "product_variants_weight_positive" CHECK ("product_variants"."weight_grams" IS NULL OR "product_variants"."weight_grams" > 0),
	CONSTRAINT "product_variants_dimensions_positive" CHECK (("product_variants"."length_millimeters" IS NULL OR "product_variants"."length_millimeters" > 0) AND ("product_variants"."width_millimeters" IS NULL OR "product_variants"."width_millimeters" > 0) AND ("product_variants"."height_millimeters" IS NULL OR "product_variants"."height_millimeters" > 0)),
	CONSTRAINT "product_variants_position_non_negative" CHECK ("product_variants"."position" >= 0),
	CONSTRAINT "product_variants_version_positive" CHECK ("product_variants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"base_price_minor" integer NOT NULL,
	"currency_code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "products_base_price_non_negative" CHECK ("products"."base_price_minor" >= 0),
	CONSTRAINT "products_currency_code_format" CHECK ("products"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "products_version_positive" CHECK ("products"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "variant_option_values" (
	"variant_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "variant_option_values_pk" PRIMARY KEY("variant_id","option_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_position_idx" ON "categories" USING btree ("parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_variant_id_unique" ON "inventory_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "inventory_items_stock_level_idx" ON "inventory_items" USING btree ("on_hand_quantity","low_stock_threshold");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_occurred_at_idx" ON "inventory_movements" USING btree ("inventory_item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_actor_user_id_idx" ON "inventory_movements" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_correlation_id_idx" ON "inventory_movements" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "product_categories_category_id_idx" ON "product_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_storage_key_unique" ON "product_images" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_primary_product_unique" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary" AND "product_images"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_primary_variant_unique" ON "product_images" USING btree ("variant_id") WHERE "product_images"."is_primary" AND "product_images"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_images_product_position_idx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_product_name_unique" ON "product_options" USING btree ("product_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_normalized_sku_unique" ON "product_variants" USING btree ("normalized_sku");--> statement-breakpoint
CREATE INDEX "product_variants_product_position_idx" ON "product_variants" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_status_updated_at_idx" ON "products" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "products_brand_id_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "variant_option_values_option_value_idx" ON "variant_option_values" USING btree ("option_id","value");