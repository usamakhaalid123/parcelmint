import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  cartItems,
  carts,
  coupons,
  inventoryItems,
  productImages,
  products,
  productVariants,
} from "@/db/schema";
import { CheckoutError } from "@/modules/checkout/domain/errors";
import { calculatePricing } from "@/modules/checkout/domain/pricing";

type Database = ReturnType<typeof getDatabase>;

export type CartLine = {
  availableQuantity: number | null;
  cartItemId: string;
  currencyCode: string;
  image: { altText: string; id: string } | null;
  productName: string;
  productSlug: string;
  quantity: number;
  sku: string;
  stockBehavior: "tracked" | "untracked";
  unitPriceMinor: number;
  variantId: string;
  variantTitle: string;
};

export type CartView = {
  couponCode: string | null;
  discountMinor: number;
  id: string;
  itemCount: number;
  lines: readonly CartLine[];
  subtotalMinor: number;
  totalMinor: number;
};

export async function findActiveCartByTokenHash(
  tokenHash: string,
  database: Database = getDatabase(),
): Promise<{ id: string } | null> {
  const [cart] = await database
    .select({ id: carts.id })
    .from(carts)
    .where(
      and(
        eq(carts.tokenHash, tokenHash),
        eq(carts.status, "active"),
        gt(carts.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return cart ?? null;
}

export async function createCart(
  tokenHash: string,
  database: Database = getDatabase(),
): Promise<{ id: string }> {
  const [cart] = await database
    .insert(carts)
    .values({
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      tokenHash,
    })
    .returning({ id: carts.id });
  if (cart === undefined) throw new Error("Cart creation did not return a row");
  return cart;
}

export async function addCartItem(
  cartId: string,
  variantId: string,
  quantity: number,
  database: Database = getDatabase(),
): Promise<void> {
  const [variant] = await database
    .select({
      availableQuantity:
        sql<number>`${inventoryItems.onHandQuantity} - ${inventoryItems.reservedQuantity}`.mapWith(
          Number,
        ),
      stockBehavior: productVariants.stockBehavior,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.isActive, true),
        eq(products.status, "active"),
      ),
    )
    .limit(1);
  if (
    variant === undefined ||
    (variant.stockBehavior === "tracked" && variant.availableQuantity < quantity)
  ) {
    throw new CheckoutError("stock_unavailable");
  }

  await database
    .insert(cartItems)
    .values({ cartId, quantity, variantId })
    .onConflictDoUpdate({
      set: {
        quantity: sql`least(99, ${cartItems.quantity} + excluded.quantity)`,
        updatedAt: new Date(),
      },
      target: [cartItems.cartId, cartItems.variantId],
    });
  await database.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export async function updateCartItem(
  cartId: string,
  cartItemId: string,
  quantity: number,
  database: Database = getDatabase(),
): Promise<void> {
  const updated = await database
    .update(cartItems)
    .set({ quantity, updatedAt: new Date() })
    .where(and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cartId)))
    .returning({ id: cartItems.id });
  if (updated.length === 0) throw new CheckoutError("cart_unavailable");
}

export async function removeCartItem(
  cartId: string,
  cartItemId: string,
  database: Database = getDatabase(),
): Promise<void> {
  await database
    .delete(cartItems)
    .where(and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cartId)));
}

export async function applyCartCoupon(
  cartId: string,
  code: string,
  now = new Date(),
  database: Database = getDatabase(),
): Promise<void> {
  const [coupon] = await database
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(
        eq(coupons.normalizedCode, code.trim().toUpperCase()),
        eq(coupons.isActive, true),
        or(isNull(coupons.startsAt), sql`${coupons.startsAt} <= ${now}`),
        or(isNull(coupons.endsAt), sql`${coupons.endsAt} > ${now}`),
      ),
    )
    .limit(1);
  if (coupon === undefined) throw new CheckoutError("coupon_invalid");
  await database
    .update(carts)
    .set({ couponId: coupon.id, updatedAt: now })
    .where(eq(carts.id, cartId));
}

export async function clearCartCoupon(cartId: string, database: Database = getDatabase()) {
  await database
    .update(carts)
    .set({ couponId: null, updatedAt: new Date() })
    .where(eq(carts.id, cartId));
}

export async function getCartView(
  cartId: string,
  database: Database = getDatabase(),
): Promise<CartView | null> {
  const [cart] = await database
    .select({
      couponCode: coupons.code,
      couponDiscountType: coupons.discountType,
      couponDiscountValue: coupons.discountValue,
      couponMaximumDiscountMinor: coupons.maximumDiscountMinor,
      couponMinimumSubtotalMinor: coupons.minimumSubtotalMinor,
      id: carts.id,
    })
    .from(carts)
    .leftJoin(coupons, eq(coupons.id, carts.couponId))
    .where(and(eq(carts.id, cartId), eq(carts.status, "active")))
    .limit(1);
  if (cart === undefined) return null;

  const rows = await database
    .select({
      availableQuantity:
        sql<number>`${inventoryItems.onHandQuantity} - ${inventoryItems.reservedQuantity}`.mapWith(
          Number,
        ),
      cartItemId: cartItems.id,
      currencyCode: products.currencyCode,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      quantity: cartItems.quantity,
      sku: productVariants.sku,
      stockBehavior: productVariants.stockBehavior,
      unitPriceMinor:
        sql<number>`coalesce(${productVariants.priceOverrideMinor}, ${products.basePriceMinor})`.mapWith(
          Number,
        ),
      variantId: productVariants.id,
      variantTitle: productVariants.title,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt));

  const imageRows = await database
    .select({
      altText: productImages.altText,
      id: productImages.id,
      productId: productImages.productId,
    })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .innerJoin(cartItems, eq(cartItems.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(sql`${productImages.isPrimary} desc`, asc(productImages.position));
  const images = new Map<string, { altText: string; id: string }>();
  for (const image of imageRows) {
    if (!images.has(image.productId)) images.set(image.productId, image);
  }
  const lines: CartLine[] = rows.map(({ productId, ...row }) => ({
    ...row,
    availableQuantity: row.stockBehavior === "untracked" ? null : row.availableQuantity,
    image: images.get(productId) ?? null,
  }));

  const pricing =
    lines.length === 0
      ? null
      : calculatePricing(
          lines.map((line) => ({
            id: line.cartItemId,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
          })),
          0,
          cart.couponDiscountType === null
            ? null
            : {
                discountType: cart.couponDiscountType,
                discountValue: cart.couponDiscountValue ?? 0,
                maximumDiscountMinor: cart.couponMaximumDiscountMinor,
                minimumSubtotalMinor: cart.couponMinimumSubtotalMinor ?? 0,
              },
        );
  return {
    couponCode: cart.couponCode,
    discountMinor: pricing?.discountMinor ?? 0,
    id: cart.id,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    lines,
    subtotalMinor: pricing?.subtotalMinor ?? 0,
    totalMinor: pricing?.grandTotalMinor ?? 0,
  };
}

export async function mergeCarts(
  sourceCartId: string,
  targetCartId: string,
  database: Database = getDatabase(),
): Promise<void> {
  if (sourceCartId === targetCartId) return;
  await database.transaction(async (transaction) => {
    const sourceItems = await transaction
      .select({ quantity: cartItems.quantity, variantId: cartItems.variantId })
      .from(cartItems)
      .where(eq(cartItems.cartId, sourceCartId));
    for (const item of sourceItems) {
      await transaction
        .insert(cartItems)
        .values({ cartId: targetCartId, quantity: item.quantity, variantId: item.variantId })
        .onConflictDoUpdate({
          set: {
            quantity: sql`least(99, ${cartItems.quantity} + excluded.quantity)`,
            updatedAt: new Date(),
          },
          target: [cartItems.cartId, cartItems.variantId],
        });
    }
    await transaction
      .update(carts)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(and(eq(carts.id, sourceCartId), eq(carts.status, "active")));
  });
}
