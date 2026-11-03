import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const variantStockBehavior = pgEnum("variant_stock_behavior", ["tracked", "untracked"]);
export const inventoryMovementSource = pgEnum("inventory_movement_source", [
  "initial",
  "adjustment",
  "csv_import",
  "return",
  "reservation_release",
  "fulfillment",
]);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("brands_slug_unique").on(table.slug),
    check("brands_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_slug_unique").on(table.slug),
    index("categories_parent_position_idx").on(table.parentId, table.position),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "categories_parent_id_categories_id_fk",
    }).onDelete("restrict"),
    check("categories_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check(
      "categories_not_own_parent",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    check("categories_position_non_negative", sql`${table.position} >= 0`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    status: productStatus("status").notNull().default("draft"),
    basePriceMinor: integer("base_price_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_status_updated_at_idx").on(table.status, table.updatedAt),
    index("products_brand_id_idx").on(table.brandId),
    check("products_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("products_base_price_non_negative", sql`${table.basePriceMinor} >= 0`),
    check("products_currency_code_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check("products_version_positive", sql`${table.version} > 0`),
  ],
);

export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.categoryId],
      name: "product_categories_pk",
    }),
    index("product_categories_category_id_idx").on(table.categoryId),
  ],
);

export const productOptions = pgTable(
  "product_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_options_product_name_unique").on(table.productId, table.name),
    check("product_options_position_non_negative", sql`${table.position} >= 0`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sku: text("sku").notNull(),
    normalizedSku: text("normalized_sku").notNull(),
    priceOverrideMinor: integer("price_override_minor"),
    stockBehavior: variantStockBehavior("stock_behavior").notNull().default("tracked"),
    weightGrams: integer("weight_grams"),
    lengthMillimeters: integer("length_millimeters"),
    widthMillimeters: integer("width_millimeters"),
    heightMillimeters: integer("height_millimeters"),
    isActive: boolean("is_active").notNull().default(true),
    position: integer("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_variants_normalized_sku_unique").on(table.normalizedSku),
    index("product_variants_product_position_idx").on(table.productId, table.position),
    check(
      "product_variants_sku_normalized",
      sql`${table.normalizedSku} = upper(trim(${table.sku}))`,
    ),
    check(
      "product_variants_price_override_non_negative",
      sql`${table.priceOverrideMinor} IS NULL OR ${table.priceOverrideMinor} >= 0`,
    ),
    check(
      "product_variants_weight_positive",
      sql`${table.weightGrams} IS NULL OR ${table.weightGrams} > 0`,
    ),
    check(
      "product_variants_dimensions_positive",
      sql`(${table.lengthMillimeters} IS NULL OR ${table.lengthMillimeters} > 0) AND (${table.widthMillimeters} IS NULL OR ${table.widthMillimeters} > 0) AND (${table.heightMillimeters} IS NULL OR ${table.heightMillimeters} > 0)`,
    ),
    check("product_variants_position_non_negative", sql`${table.position} >= 0`),
    check("product_variants_version_positive", sql`${table.version} > 0`),
  ],
);

export const variantOptionValues = pgTable(
  "variant_option_values",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.variantId, table.optionId],
      name: "variant_option_values_pk",
    }),
    index("variant_option_values_option_value_idx").on(table.optionId, table.value),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    altText: text("alt_text").notNull(),
    position: integer("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_images_storage_key_unique").on(table.storageKey),
    uniqueIndex("product_images_primary_product_unique")
      .on(table.productId)
      .where(sql`${table.isPrimary} AND ${table.variantId} IS NULL`),
    uniqueIndex("product_images_primary_variant_unique")
      .on(table.variantId)
      .where(sql`${table.isPrimary} AND ${table.variantId} IS NOT NULL`),
    index("product_images_product_position_idx").on(table.productId, table.position),
    check("product_images_position_non_negative", sql`${table.position} >= 0`),
    check("product_images_storage_key_not_blank", sql`length(trim(${table.storageKey})) > 0`),
    check("product_images_alt_text_not_blank", sql`length(trim(${table.altText})) > 0`),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    onHandQuantity: integer("on_hand_quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_items_variant_id_unique").on(table.variantId),
    index("inventory_items_stock_level_idx").on(table.onHandQuantity, table.lowStockThreshold),
    check("inventory_items_on_hand_non_negative", sql`${table.onHandQuantity} >= 0`),
    check("inventory_items_reserved_non_negative", sql`${table.reservedQuantity} >= 0`),
    check(
      "inventory_items_reserved_not_over_on_hand",
      sql`${table.reservedQuantity} <= ${table.onHandQuantity}`,
    ),
    check("inventory_items_low_stock_non_negative", sql`${table.lowStockThreshold} >= 0`),
    check("inventory_items_version_positive", sql`${table.version} > 0`),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    source: inventoryMovementSource("source").notNull(),
    quantityBefore: integer("quantity_before").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    reason: text("reason").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    correlationId: uuid("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_movements_item_occurred_at_idx").on(table.inventoryItemId, table.occurredAt),
    index("inventory_movements_actor_user_id_idx").on(table.actorUserId),
    index("inventory_movements_correlation_id_idx").on(table.correlationId),
    check("inventory_movements_delta_non_zero", sql`${table.quantityDelta} <> 0`),
    check("inventory_movements_before_non_negative", sql`${table.quantityBefore} >= 0`),
    check("inventory_movements_after_non_negative", sql`${table.quantityAfter} >= 0`),
    check(
      "inventory_movements_quantity_consistent",
      sql`${table.quantityAfter} = ${table.quantityBefore} + ${table.quantityDelta}`,
    ),
    check("inventory_movements_reason_not_blank", sql`length(trim(${table.reason})) > 0`),
  ],
);
