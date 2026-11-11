import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { deliveryZones, productVariants, shippingRates, users } from "@/db/schema";
import type { StaffPrincipal } from "@/modules/auth";
import { createCompleteProduct } from "@/modules/catalog";
import { addCartItem, createCart } from "@/modules/checkout/server/cart-repository";
import { createOrderFromCart } from "@/modules/checkout/server/checkout-service";
import {
  confirmOrderManually,
  createShipmentLabel,
  handoffOrder,
  transitionFulfillment,
  transitionShipment,
} from "@/modules/orders/server/order-service";

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
test.skip(e2eDatabaseUrl === undefined, "Requires an explicitly disposable E2E database.");

let productName: string;
let productSlug: string;
let returnOrderNumber: string;
const returnMobile = "+923005555555";

test.beforeAll(async () => {
  if (e2eDatabaseUrl === undefined) return;
  const databaseName = new URL(e2eDatabaseUrl).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error("E2E_DATABASE_URL must reference a database whose name ends in _test.");
  }
  const pool = new Pool({ connectionString: e2eDatabaseUrl });
  const database = drizzle(pool, { schema });
  const [actor] = await database
    .insert(users)
    .values({ accountType: "staff", identityId: randomUUID() })
    .returning({ id: users.id });
  const principal: StaffPrincipal = {
    accountType: "staff",
    permissionKeys: new Set(["catalog.manage", "inventory.adjust", "orders.manage"]),
    status: "active",
    userId: actor?.id ?? "",
  };
  const token = randomUUID();
  productName = `Discoverable product ${token}`;
  productSlug = `discoverable-product-${token}`;
  const created = await createCompleteProduct(
    {
      actor: principal,
      basePriceMinor: 12_500,
      categories: [{ name: "Browser category", slug: `browser-category-${token}` }],
      correlationId: randomUUID(),
      currencyCode: "PKR",
      description: "A product created only in the disposable browser-test database.",
      initialQuantity: 5,
      inventoryReason: "Browser acceptance test opening stock",
      lowStockThreshold: 1,
      name: productName,
      optionValues: [],
      slug: productSlug,
      status: "active",
      variant: {
        isActive: true,
        sku: `BROWSER-${token}`,
        stockBehavior: "tracked",
        title: "Default",
      },
    },
    database,
  );
  const [zone] = await database
    .insert(deliveryZones)
    .values({
      code: `BROWSER_${token.replaceAll("-", "").toUpperCase()}`,
      name: "Browser test area",
    })
    .returning({ id: deliveryZones.id });
  if (zone === undefined) throw new Error("Browser delivery zone was not created");
  await database.insert(shippingRates).values({
    currencyCode: "PKR",
    deliveryZoneId: zone.id,
    estimatedDaysMax: 3,
    estimatedDaysMin: 1,
    feeMinor: 500,
    name: "Browser standard delivery",
  });
  const [variant] = await database
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, created.productId));
  if (variant === undefined) throw new Error("Browser product variant was not created");
  const cart = await createCart(`browser-return-${randomUUID()}`, database);
  await addCartItem(cart.id, variant.id, 2, database);
  const returnOrder = await createOrderFromCart(
    cart.id,
    {
      addressLine: "55 Browser Return Street",
      customerName: "Browser Return Customer",
      deliveryInstructions: null,
      deliveryZoneId: zone.id,
      email: null,
      idempotencyKey: randomUUID(),
      landmark: null,
      mobileNumber: returnMobile,
      policyConsent: "on",
      postalCode: null,
    },
    database,
  );
  returnOrderNumber = returnOrder.orderNumber;
  await confirmOrderManually(
    {
      actor: principal,
      correlationId: randomUUID(),
      orderId: returnOrder.orderId,
      reason: "Browser return confirmation",
    },
    database,
  );
  await transitionFulfillment(
    {
      actor: principal,
      correlationId: randomUUID(),
      nextState: "processing",
      orderId: returnOrder.orderId,
      reason: "Browser processing",
    },
    database,
  );
  await transitionFulfillment(
    {
      actor: principal,
      correlationId: randomUUID(),
      nextState: "packed",
      orderId: returnOrder.orderId,
      reason: "Browser packed",
    },
    database,
  );
  await createShipmentLabel(
    {
      actor: principal,
      correlationId: randomUUID(),
      courierCode: "BROWSER",
      orderId: returnOrder.orderId,
      reason: "Browser label",
      trackingNumber: `BROWSER-${randomUUID()}`,
    },
    database,
  );
  await handoffOrder(
    {
      actor: principal,
      correlationId: randomUUID(),
      orderId: returnOrder.orderId,
      reason: "Browser handoff",
    },
    database,
  );
  for (const nextState of ["in_transit", "out_for_delivery", "delivered"] as const) {
    await transitionShipment(
      {
        actor: principal,
        correlationId: randomUUID(),
        nextState,
        orderId: returnOrder.orderId,
        reason: `Browser ${nextState}`,
      },
      database,
    );
  }
  await pool.end();
});

test("customers can discover an available product and open its details", async ({
  page,
  request,
}) => {
  await page.goto(`/products?query=${encodeURIComponent(productName)}`);
  await expect(page.getByRole("heading", { level: 2, name: productName })).toBeVisible();
  const productLink = page.getByRole("link", { name: new RegExp(productName) });
  await expect(productLink).toHaveAttribute("href", `/products/${productSlug}`);
  const detailResponse = await request.get(`/products/${productSlug}`);
  expect(detailResponse.ok()).toBe(true);
  await page.goto(`/products/${productSlug}`);
  await expect(page).toHaveURL(new RegExp(`/products/${productSlug}$`));
  await expect(page.getByRole("heading", { level: 1, name: productName })).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
});

test("a guest can place a cash-on-delivery order", async ({ page, request }) => {
  await request.get(`/products/${productSlug}`);
  await page.goto(`/products/${productSlug}`);
  await expect(page.locator('form input[name^="$ACTION_"]').first()).toBeAttached();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/cart\?notice=added$/);
  await expect(page.getByRole("heading", { level: 1, name: "Shopping cart" })).toBeVisible();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { level: 1, name: "Delivery details" })).toBeVisible();

  await page.getByLabel("Full name").fill("Browser Guest");
  await page.getByLabel("Mobile number").fill("+92 300 1234567");
  await page.getByLabel("Complete delivery address").fill("12 Browser Acceptance Street");
  await page.getByLabel(/I agree to the terms/).check();
  await page.getByRole("button", { name: "Place cash-on-delivery order" }).click();

  await expect(page).toHaveURL(/\/checkout\/confirmation\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Thank you for your order" }),
  ).toBeVisible();
  await expect(page.getByText("Pending verification", { exact: true })).toBeVisible();
});

test("a guest can verify tracking and request a partial return", async ({ page }) => {
  await page.goto("/track");
  await expect(page.locator('form input[name^="$ACTION_"]').first()).toBeAttached();
  await page.getByLabel("Order number").fill(returnOrderNumber);
  await page.getByLabel("Mobile number").fill(returnMobile);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page).toHaveURL(/\/track\/verify\?challenge=/);
  const developmentNotice = await page.getByText(/Local development code:/).textContent();
  const code = developmentNotice?.match(/\d{6}/)?.[0];
  if (code === undefined) throw new Error("Tracking development code was not rendered");
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify and view order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: returnOrderNumber })).toBeVisible();
  await expect(page.getByText("delivered", { exact: true })).toBeVisible();
  const returnSection = page
    .getByRole("heading", { level: 2, name: "Request a return" })
    .locator("..");
  await returnSection.getByLabel("Quantity").first().fill("1");
  await returnSection.getByLabel("Reason").first().fill("Item is not suitable");
  await returnSection.getByRole("button", { name: "Request return" }).first().click();
  await expect(page.getByText("Your request was recorded.")).toBeVisible();
  await expect(page.getByText(/requested — Item is not suitable/)).toBeVisible();
});
