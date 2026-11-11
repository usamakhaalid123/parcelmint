import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { getServerEnvironment } from "@/config/env";
import {
  createCart,
  findActiveCartByTokenHash,
  getCartView,
  type CartView,
} from "@/modules/checkout/server/cart-repository";

const CART_COOKIE = "parcelmint_cart";

export function hashCartToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentCart(): Promise<CartView | null> {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (token === undefined) return null;
  const cart = await findActiveCartByTokenHash(hashCartToken(token));
  return cart === null ? null : getCartView(cart.id);
}

export async function requireMutableCart(): Promise<{ id: string }> {
  const store = await cookies();
  const existingToken = store.get(CART_COOKIE)?.value;
  if (existingToken !== undefined) {
    const existing = await findActiveCartByTokenHash(hashCartToken(existingToken));
    if (existing !== null) return existing;
  }

  const token = randomBytes(32).toString("base64url");
  const cart = await createCart(hashCartToken(token));
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: getServerEnvironment().deployment !== "local",
  });
  return cart;
}

export async function clearCartSession(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}
