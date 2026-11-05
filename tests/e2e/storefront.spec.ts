import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { users } from "@/db/schema";
import type { StaffPrincipal } from "@/modules/auth";
import { createCompleteProduct } from "@/modules/catalog";

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
test.skip(e2eDatabaseUrl === undefined, "Requires an explicitly disposable E2E database.");

let productName: string;
let productSlug: string;

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
    permissionKeys: new Set(["catalog.manage", "inventory.adjust"]),
    status: "active",
    userId: actor?.id ?? "",
  };
  const token = randomUUID();
  productName = `Discoverable product ${token}`;
  productSlug = `discoverable-product-${token}`;
  await createCompleteProduct(
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
