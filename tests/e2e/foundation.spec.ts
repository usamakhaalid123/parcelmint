import { expect, test } from "@playwright/test";

test("renders the accessible foundation page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Commerce that stays clear from order to reconciliation.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
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
