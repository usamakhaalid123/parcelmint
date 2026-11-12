import { expect, test } from "@playwright/test";

test("renders the accessible foundation page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Shop with confidence. Pay at your door.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
});

test("applies the responsive UI foundation and visible keyboard focus", async ({ page }) => {
  await page.goto("/");

  const search = page.getByRole("searchbox", { name: "Search products" });
  await search.focus();
  const focus = await search.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { outlineStyle: styles.outlineStyle, outlineWidth: styles.outlineWidth };
  });
  expect(focus.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);

  const searchButton = page.getByRole("button", { name: "Search products" });
  expect(
    await searchButton.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
});

test("renders the public catalog empty state accessibly", async ({ page }) => {
  await page.goto("/products?query=guaranteed-no-match-browser-test");

  await expect(
    page.getByRole("heading", { level: 1, name: "Products for everyday moments." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "No products match." })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();
});

test("keeps the primary storefront journey responsive across supported widths", async ({
  page,
}) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ height: 900, width });
    await page.goto("/");

    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
    await expect(page.getByRole("searchbox", { name: "Search products" })).toBeVisible();

    if (width < 768) {
      await page.locator("header details > summary").click();
      await expect(page.getByRole("navigation", { name: "Mobile storefront" })).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Storefront" })).toBeVisible();
    }
  }
});

test("exposes catalog filters without client-side JavaScript", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 390 });
  await page.goto("/products?query=guaranteed-no-match-browser-test");

  await expect(page.getByText("Filters and sort", { exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reset filters" })).toBeVisible();
});

test("exposes a non-cacheable health endpoint", async ({ request }) => {
  const response = await request.get("/api/v1/health");

  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ environment: "local", status: "ok" });
});

test("redirects unauthenticated catalog administrators to sign in", async ({ page }) => {
  await page.goto("/admin/catalog");

  await expect(page).toHaveURL(/\/admin\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to continue." })).toBeVisible();
});

test("protects order operations from unauthenticated access", async ({ page }) => {
  await page.goto("/admin/orders");

  await expect(page).toHaveURL(/\/admin\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to continue." })).toBeVisible();
});

test("protects COD reconciliation and reports from unauthenticated access", async ({
  page,
  request,
}) => {
  await page.goto("/admin/cash");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);

  const reportsResponse = await request.get("/admin/reports", { maxRedirects: 0 });
  expect(reportsResponse.status()).toBe(307);
  expect(reportsResponse.headers().location).toBe("/admin/sign-in");

  const response = await request.get("/api/v1/admin/reports/cod.csv");
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
