import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { inventoryItems, productVariants } from "./catalog";

export const cartStatus = pgEnum("cart_status", ["active", "converted", "abandoned"]);
export const couponDiscountType = pgEnum("coupon_discount_type", ["fixed", "percentage"]);
export const orderLifecycleState = pgEnum("order_lifecycle_state", [
  "active",
  "closed",
  "cancelled",
]);
export const orderVerificationState = pgEnum("order_verification_state", [
  "pending",
  "confirmed",
  "rejected",
  "expired",
]);
export const orderFulfillmentState = pgEnum("order_fulfillment_state", [
  "unfulfilled",
  "processing",
  "packed",
  "fulfilled",
  "cancelled",
]);
export const inventoryReservationState = pgEnum("inventory_reservation_state", [
  "active",
  "released",
  "consumed",
]);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    normalizedCode: text("normalized_code").notNull(),
    discountType: couponDiscountType("discount_type").notNull(),
    discountValue: integer("discount_value").notNull(),
    maximumDiscountMinor: integer("maximum_discount_minor"),
    minimumSubtotalMinor: integer("minimum_subtotal_minor").notNull().default(0),
    currencyCode: text("currency_code"),
    usageLimit: integer("usage_limit"),
    perCustomerLimit: integer("per_customer_limit"),
    startsAt: timestamp("starts_at", { mode: "date", withTimezone: true }),
    endsAt: timestamp("ends_at", { mode: "date", withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("coupons_normalized_code_unique").on(table.normalizedCode),
    check("coupons_code_normalized", sql`${table.normalizedCode} = upper(trim(${table.code}))`),
    check("coupons_discount_value_positive", sql`${table.discountValue} > 0`),
    check(
      "coupons_percentage_valid",
      sql`${table.discountType} <> 'percentage' OR ${table.discountValue} <= 10000`,
    ),
    check(
      "coupons_maximum_discount_non_negative",
      sql`${table.maximumDiscountMinor} IS NULL OR ${table.maximumDiscountMinor} >= 0`,
    ),
    check("coupons_minimum_subtotal_non_negative", sql`${table.minimumSubtotalMinor} >= 0`),
    check(
      "coupons_currency_format",
      sql`${table.currencyCode} IS NULL OR ${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "coupons_usage_limit_positive",
      sql`${table.usageLimit} IS NULL OR ${table.usageLimit} > 0`,
    ),
    check(
      "coupons_per_customer_limit_positive",
      sql`${table.perCustomerLimit} IS NULL OR ${table.perCustomerLimit} > 0`,
    ),
    check(
      "coupons_date_range_valid",
      sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.startsAt} < ${table.endsAt}`,
    ),
  ],
);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    status: cartStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("carts_token_hash_unique").on(table.tokenHash),
    index("carts_user_status_idx").on(table.userId, table.status),
    index("carts_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cart_items_cart_variant_unique").on(table.cartId, table.variantId),
    index("cart_items_variant_id_idx").on(table.variantId),
    check("cart_items_quantity_valid", sql`${table.quantity} > 0 AND ${table.quantity} <= 99`),
  ],
);

export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("delivery_zones_code_unique").on(table.code),
    check("delivery_zones_code_format", sql`${table.code} ~ '^[A-Z0-9_-]+$'`),
    check("delivery_zones_position_non_negative", sql`${table.position} >= 0`),
  ],
);

export const shippingRates = pgTable(
  "shipping_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryZoneId: uuid("delivery_zone_id")
      .notNull()
      .references(() => deliveryZones.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    feeMinor: integer("fee_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    minimumSubtotalMinor: integer("minimum_subtotal_minor").notNull().default(0),
    maximumSubtotalMinor: integer("maximum_subtotal_minor"),
    estimatedDaysMin: integer("estimated_days_min").notNull(),
    estimatedDaysMax: integer("estimated_days_max").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shipping_rates_zone_active_idx").on(table.deliveryZoneId, table.isActive),
    check("shipping_rates_fee_non_negative", sql`${table.feeMinor} >= 0`),
    check("shipping_rates_currency_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check("shipping_rates_minimum_non_negative", sql`${table.minimumSubtotalMinor} >= 0`),
    check(
      "shipping_rates_range_valid",
      sql`${table.maximumSubtotalMinor} IS NULL OR ${table.maximumSubtotalMinor} >= ${table.minimumSubtotalMinor}`,
    ),
    check(
      "shipping_rates_days_valid",
      sql`${table.estimatedDaysMin} > 0 AND ${table.estimatedDaysMax} >= ${table.estimatedDaysMin}`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull(),
    cartId: uuid("cart_id").references(() => carts.id, { onDelete: "set null" }),
    deliveryZoneId: uuid("delivery_zone_id").references(() => deliveryZones.id, {
      onDelete: "restrict",
    }),
    customerName: text("customer_name").notNull(),
    mobileNumber: text("mobile_number").notNull(),
    email: text("email"),
    deliveryInstructions: text("delivery_instructions"),
    lifecycleState: orderLifecycleState("lifecycle_state").notNull().default("active"),
    verificationState: orderVerificationState("verification_state").notNull().default("pending"),
    fulfillmentState: orderFulfillmentState("fulfillment_state").notNull().default("unfulfilled"),
    currencyCode: text("currency_code").notNull(),
    roundingPolicy: text("rounding_policy").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    shippingMinor: integer("shipping_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    grandTotalMinor: integer("grand_total_minor").notNull(),
    policyVersion: text("policy_version").notNull(),
    policyConsentAt: timestamp("policy_consent_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
    index("orders_mobile_created_at_idx").on(table.mobileNumber, table.createdAt),
    index("orders_states_idx").on(table.verificationState, table.fulfillmentState),
    check("orders_customer_name_not_blank", sql`length(trim(${table.customerName})) > 0`),
    check("orders_mobile_not_blank", sql`length(trim(${table.mobileNumber})) > 0`),
    check("orders_currency_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check(
      "orders_totals_non_negative",
      sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.shippingMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.grandTotalMinor} >= 0`,
    ),
    check(
      "orders_total_consistent",
      sql`${table.grandTotalMinor} = ${table.subtotalMinor} - ${table.discountMinor} + ${table.shippingMinor} + ${table.taxMinor}`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    sku: text("sku").notNull(),
    selectedOptions: jsonb("selected_options").notNull().default({}),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    discountAllocationMinor: integer("discount_allocation_minor").notNull().default(0),
    taxAllocationMinor: integer("tax_allocation_minor").notNull().default(0),
    lineTotalMinor: integer("line_total_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "order_items_amounts_non_negative",
      sql`${table.unitPriceMinor} >= 0 AND ${table.discountAllocationMinor} >= 0 AND ${table.taxAllocationMinor} >= 0 AND ${table.lineTotalMinor} >= 0`,
    ),
    check("order_items_currency_format", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
  ],
);

export const orderAddresses = pgTable(
  "order_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    addressType: text("address_type").notNull().default("delivery"),
    deliveryArea: text("delivery_area").notNull(),
    addressLine: text("address_line").notNull(),
    landmark: text("landmark"),
    postalCode: text("postal_code"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("order_addresses_order_type_unique").on(table.orderId, table.addressType),
    check("order_addresses_type_delivery", sql`${table.addressType} = 'delivery'`),
    check("order_addresses_area_not_blank", sql`length(trim(${table.deliveryArea})) > 0`),
    check("order_addresses_line_not_blank", sql`length(trim(${table.addressLine})) > 0`),
  ],
);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    state: inventoryReservationState("state").notNull().default("active"),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_reservations_order_item_unique").on(table.orderItemId),
    index("inventory_reservations_expiry_idx").on(table.state, table.expiresAt),
    index("inventory_reservations_inventory_item_idx").on(table.inventoryItemId, table.state),
    check("inventory_reservations_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "inventory_reservations_release_consistent",
      sql`(${table.state} = 'released' AND ${table.releasedAt} IS NOT NULL) OR (${table.state} <> 'released' AND ${table.releasedAt} IS NULL)`,
    ),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    requestHash: text("request_hash").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [index("idempotency_keys_expiry_idx").on(table.expiresAt)],
);

export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    subjectHash: text("subject_hash").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("rate_limit_events_lookup_idx").on(table.action, table.subjectHash, table.occurredAt),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerKeyHash: text("customer_key_hash").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    redeemedAt: timestamp("redeemed_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.couponId, table.orderId], name: "coupon_redemptions_pk" }),
    index("coupon_redemptions_customer_idx").on(table.couponId, table.customerKeyHash),
    check("coupon_redemptions_discount_non_negative", sql`${table.discountMinor} >= 0`),
  ],
);
