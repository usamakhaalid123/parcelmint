import { createHash, randomUUID } from "node:crypto";

import { and, asc, count, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  carts,
  codCollections,
  couponRedemptions,
  coupons,
  deliveryZones,
  idempotencyKeys,
  inventoryItems,
  inventoryReservations,
  operationalBlocks,
  orderAddresses,
  orderItems,
  orders,
  orderRiskFlags,
  outboxEvents,
  shippingRates,
} from "@/db/schema";
import { CheckoutError } from "@/modules/checkout/domain/errors";
import { calculatePricing } from "@/modules/checkout/domain/pricing";
import type { CheckoutInput } from "@/modules/checkout/schemas/checkout-input";

type Database = ReturnType<typeof getDatabase>;

const checkoutResultSchema = z.object({
  currencyCode: z.string(),
  grandTotalMinor: z.number().int(),
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  verificationState: z.literal("pending"),
});

export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

type LockedCheckoutLine = {
  cartItemId: string;
  currencyCode: string;
  inventoryItemId: string;
  isActive: boolean;
  onHandQuantity: number;
  priceMinor: number;
  productName: string;
  productStatus: "active" | "archived" | "draft";
  quantity: number;
  reservedQuantity: number;
  sku: string;
  stockBehavior: "tracked" | "untracked";
  variantId: string;
  variantTitle: string;
};

export type DeliveryOption = {
  estimatedDaysMax: number;
  estimatedDaysMin: number;
  feeMinor: number;
  id: string;
  name: string;
  zoneName: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeAddressForRisk(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function requestHash(cartId: string, input: CheckoutInput, customerUserId: string | null): string {
  return sha256(
    JSON.stringify({
      addressLine: input.addressLine,
      cartId,
      customerName: input.customerName,
      customerUserId,
      deliveryInstructions: input.deliveryInstructions,
      deliveryZoneId: input.deliveryZoneId,
      email: input.email,
      landmark: input.landmark,
      mobileNumber: input.mobileNumber,
      policyConsent: input.policyConsent,
      postalCode: input.postalCode,
    }),
  );
}

export async function listDeliveryOptions(
  currencyCode: string,
  subtotalMinor: number,
  payableBeforeShippingMinor = subtotalMinor,
  database: Database = getDatabase(),
): Promise<readonly DeliveryOption[]> {
  return database
    .select({
      estimatedDaysMax: shippingRates.estimatedDaysMax,
      estimatedDaysMin: shippingRates.estimatedDaysMin,
      feeMinor: shippingRates.feeMinor,
      id: deliveryZones.id,
      name: shippingRates.name,
      zoneName: deliveryZones.name,
    })
    .from(deliveryZones)
    .innerJoin(shippingRates, eq(shippingRates.deliveryZoneId, deliveryZones.id))
    .where(
      and(
        eq(deliveryZones.isActive, true),
        eq(deliveryZones.codEnabled, true),
        eq(shippingRates.isActive, true),
        eq(shippingRates.currencyCode, currencyCode),
        lte(shippingRates.minimumSubtotalMinor, subtotalMinor),
        or(
          isNull(shippingRates.maximumSubtotalMinor),
          gte(shippingRates.maximumSubtotalMinor, subtotalMinor),
        ),
        sql`${deliveryZones.codMinimumMinor} <= ${payableBeforeShippingMinor} + ${shippingRates.feeMinor}`,
        or(
          isNull(deliveryZones.codMaximumMinor),
          sql`${deliveryZones.codMaximumMinor} >= ${payableBeforeShippingMinor} + ${shippingRates.feeMinor}`,
        ),
      ),
    )
    .orderBy(asc(deliveryZones.position), asc(shippingRates.feeMinor));
}

export async function createOrderFromCart(
  cartId: string,
  input: CheckoutInput,
  database: Database = getDatabase(),
  customerUserId: string | null = null,
): Promise<CheckoutResult> {
  const hash = requestHash(cartId, input, customerUserId);

  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const [existing] = await transaction
      .select({ requestHash: idempotencyKeys.requestHash, response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, input.idempotencyKey))
      .limit(1);
    if (existing !== undefined) {
      if (existing.requestHash !== hash) throw new CheckoutError("idempotency_conflict");
      return checkoutResultSchema.parse(existing.response);
    }

    const cartRows = await transaction.execute<LockedCheckoutLine>(sql`
      SELECT
        ci.id AS "cartItemId",
        ci.quantity AS "quantity",
        pv.id AS "variantId",
        pv.title AS "variantTitle",
        pv.sku AS "sku",
        pv.is_active AS "isActive",
        pv.stock_behavior AS "stockBehavior",
        p.name AS "productName",
        p.status AS "productStatus",
        p.currency_code AS "currencyCode",
        coalesce(pv.price_override_minor, p.base_price_minor) AS "priceMinor",
        ii.id AS "inventoryItemId",
        ii.on_hand_quantity AS "onHandQuantity",
        ii.reserved_quantity AS "reservedQuantity"
      FROM cart_items ci
      JOIN carts c ON c.id = ci.cart_id
      JOIN product_variants pv ON pv.id = ci.variant_id
      JOIN products p ON p.id = pv.product_id
      JOIN inventory_items ii ON ii.variant_id = pv.id
      WHERE c.id = ${cartId} AND c.status = 'active' AND c.expires_at > now()
      ORDER BY ii.id
      FOR UPDATE OF c, pv, p, ii
    `);
    const lines = cartRows.rows;
    if (lines.length === 0) throw new CheckoutError("cart_empty");
    if (lines.some((line) => !line.isActive || line.productStatus !== "active")) {
      throw new CheckoutError("cart_unavailable");
    }
    if (
      lines.some(
        (line) =>
          line.stockBehavior === "tracked" &&
          line.onHandQuantity - line.reservedQuantity < line.quantity,
      )
    ) {
      throw new CheckoutError("stock_unavailable");
    }
    const currencyCode = lines[0]?.currencyCode ?? "";
    if (lines.some((line) => line.currencyCode !== currencyCode)) {
      throw new CheckoutError("mixed_currency");
    }

    const subtotalMinor = lines.reduce((total, line) => total + line.priceMinor * line.quantity, 0);
    const [delivery] = await transaction
      .select({
        areaName: deliveryZones.name,
        codEnabled: deliveryZones.codEnabled,
        codMaximumMinor: deliveryZones.codMaximumMinor,
        codMinimumMinor: deliveryZones.codMinimumMinor,
        feeMinor: shippingRates.feeMinor,
      })
      .from(deliveryZones)
      .innerJoin(shippingRates, eq(shippingRates.deliveryZoneId, deliveryZones.id))
      .where(
        and(
          eq(deliveryZones.id, input.deliveryZoneId),
          eq(deliveryZones.isActive, true),
          eq(shippingRates.isActive, true),
          eq(shippingRates.currencyCode, currencyCode),
          lte(shippingRates.minimumSubtotalMinor, subtotalMinor),
          or(
            isNull(shippingRates.maximumSubtotalMinor),
            gte(shippingRates.maximumSubtotalMinor, subtotalMinor),
          ),
        ),
      )
      .orderBy(asc(shippingRates.feeMinor))
      .limit(1);
    if (delivery === undefined) throw new CheckoutError("delivery_unsupported");

    const now = new Date();
    const mobileHash = sha256(input.mobileNumber);
    const addressHash = sha256(normalizeAddressForRisk(input.addressLine));
    const [activeBlock] = await transaction
      .select({ id: operationalBlocks.id })
      .from(operationalBlocks)
      .where(
        and(
          or(
            and(eq(operationalBlocks.type, "mobile"), eq(operationalBlocks.valueHash, mobileHash)),
            and(
              eq(operationalBlocks.type, "address"),
              eq(operationalBlocks.valueHash, addressHash),
            ),
          ),
          or(isNull(operationalBlocks.expiresAt), gt(operationalBlocks.expiresAt, now)),
        ),
      )
      .limit(1);
    if (activeBlock !== undefined) throw new CheckoutError("checkout_blocked");

    const [cart] = await transaction
      .select({ couponId: carts.couponId })
      .from(carts)
      .where(eq(carts.id, cartId))
      .limit(1);
    let appliedCoupon: {
      discountType: "fixed" | "percentage";
      discountValue: number;
      id: string;
      maximumDiscountMinor: number | null;
      minimumSubtotalMinor: number;
    } | null = null;
    const customerKeyHash = mobileHash;
    if (cart?.couponId !== null && cart?.couponId !== undefined) {
      const [coupon] = await transaction
        .select()
        .from(coupons)
        .where(eq(coupons.id, cart.couponId))
        .for("update")
        .limit(1);
      if (
        coupon === undefined ||
        !coupon.isActive ||
        (coupon.startsAt !== null && coupon.startsAt > new Date()) ||
        (coupon.endsAt !== null && coupon.endsAt <= new Date()) ||
        (coupon.currencyCode !== null && coupon.currencyCode !== currencyCode)
      ) {
        throw new CheckoutError("coupon_invalid");
      }
      const [[totalUse], [customerUse]] = await Promise.all([
        transaction
          .select({ value: count() })
          .from(couponRedemptions)
          .where(eq(couponRedemptions.couponId, coupon.id)),
        transaction
          .select({ value: count() })
          .from(couponRedemptions)
          .where(
            and(
              eq(couponRedemptions.couponId, coupon.id),
              eq(couponRedemptions.customerKeyHash, customerKeyHash),
            ),
          ),
      ]);
      if (
        (coupon.usageLimit !== null && (totalUse?.value ?? 0) >= coupon.usageLimit) ||
        (coupon.perCustomerLimit !== null &&
          (customerUse?.value ?? 0) >= coupon.perCustomerLimit) ||
        subtotalMinor < coupon.minimumSubtotalMinor
      ) {
        throw new CheckoutError("coupon_invalid");
      }
      appliedCoupon = coupon;
    }

    const pricing = calculatePricing(
      lines.map((line) => ({
        id: line.variantId,
        quantity: line.quantity,
        unitPriceMinor: line.priceMinor,
      })),
      delivery.feeMinor,
      appliedCoupon,
    );
    if (
      !delivery.codEnabled ||
      pricing.grandTotalMinor < delivery.codMinimumMinor ||
      (delivery.codMaximumMinor !== null && pricing.grandTotalMinor > delivery.codMaximumMinor)
    ) {
      throw new CheckoutError("delivery_unsupported");
    }
    const [recentSimilarOrders] = await transaction
      .select({ value: count() })
      .from(orders)
      .where(
        and(
          eq(orders.mobileNumber, input.mobileNumber),
          gt(orders.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
        ),
      );
    const orderId = randomUUID();
    const orderNumber = `PM-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    await transaction.insert(orders).values({
      cartId,
      currencyCode,
      customerUserId,
      customerName: input.customerName,
      deliveryInstructions: input.deliveryInstructions,
      deliveryZoneId: input.deliveryZoneId,
      discountMinor: pricing.discountMinor,
      email: input.email,
      grandTotalMinor: pricing.grandTotalMinor,
      id: orderId,
      mobileNumber: input.mobileNumber,
      orderNumber,
      policyConsentAt: now,
      policyVersion: "2026-11-05",
      roundingPolicy: "integer_minor_units_half_away_from_zero",
      shippingMinor: pricing.shippingMinor,
      subtotalMinor: pricing.subtotalMinor,
      taxMinor: pricing.taxMinor,
    });
    await transaction.insert(codCollections).values({
      currencyCode,
      expectedAmountMinor: pricing.grandTotalMinor,
      orderId,
    });
    await transaction.insert(orderAddresses).values({
      addressLine: input.addressLine,
      deliveryArea: delivery.areaName,
      landmark: input.landmark,
      orderId,
      postalCode: input.postalCode,
    });
    if ((recentSimilarOrders?.value ?? 0) > 0) {
      await transaction.insert(orderRiskFlags).values({
        code: "recent_mobile_order",
        details: { lookbackHours: 24, matchingOrders: recentSimilarOrders?.value ?? 0 },
        orderId,
      });
    }

    for (const line of lines) {
      const discountAllocationMinor = pricing.lineDiscounts.get(line.variantId) ?? 0;
      const [orderItem] = await transaction
        .insert(orderItems)
        .values({
          currencyCode,
          discountAllocationMinor,
          lineTotalMinor: line.priceMinor * line.quantity - discountAllocationMinor,
          orderId,
          productName: line.productName,
          quantity: line.quantity,
          selectedOptions: { variant: line.variantTitle },
          sku: line.sku,
          unitPriceMinor: line.priceMinor,
          variantId: line.variantId,
        })
        .returning({ id: orderItems.id });
      if (orderItem === undefined) throw new Error("Order item creation did not return a row");
      if (line.stockBehavior === "tracked") {
        const reserved = await transaction
          .update(inventoryItems)
          .set({
            reservedQuantity: sql`${inventoryItems.reservedQuantity} + ${line.quantity}`,
            updatedAt: now,
            version: sql`${inventoryItems.version} + 1`,
          })
          .where(
            and(
              eq(inventoryItems.id, line.inventoryItemId),
              sql`${inventoryItems.onHandQuantity} - ${inventoryItems.reservedQuantity} >= ${line.quantity}`,
            ),
          )
          .returning({ id: inventoryItems.id });
        if (reserved.length === 0) throw new CheckoutError("stock_unavailable");
        await transaction.insert(inventoryReservations).values({
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          inventoryItemId: line.inventoryItemId,
          orderId,
          orderItemId: orderItem.id,
          quantity: line.quantity,
        });
      }
    }

    if (appliedCoupon !== null) {
      await transaction.insert(couponRedemptions).values({
        couponId: appliedCoupon.id,
        customerKeyHash,
        discountMinor: pricing.discountMinor,
        orderId,
      });
    }
    const result: CheckoutResult = {
      currencyCode,
      grandTotalMinor: pricing.grandTotalMinor,
      orderId,
      orderNumber,
      verificationState: "pending",
    };
    await transaction.insert(idempotencyKeys).values({
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      key: input.idempotencyKey,
      requestHash: hash,
      resourceId: orderId,
      resourceType: "order",
      response: result,
    });
    await transaction.insert(outboxEvents).values({
      aggregateId: orderId,
      aggregateType: "order",
      idempotencyKey: `order.received:${orderId}`,
      payload: { orderId, orderNumber },
      topic: "order.received",
    });
    await transaction.insert(outboxEvents).values({
      aggregateId: orderId,
      aggregateType: "order",
      idempotencyKey: `order.verification_required:${orderId}`,
      payload: { orderId },
      topic: "order.verification_required",
    });
    await transaction
      .update(carts)
      .set({ status: "converted", updatedAt: now })
      .where(eq(carts.id, cartId));
    return result;
  });
}

export async function getOrderConfirmation(
  orderId: string,
  database: Database = getDatabase(),
): Promise<CheckoutResult | null> {
  const [order] = await database
    .select({
      currencyCode: orders.currencyCode,
      grandTotalMinor: orders.grandTotalMinor,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      verificationState: orders.verificationState,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (order === undefined || order.verificationState !== "pending") return null;
  return { ...order, verificationState: "pending" };
}
