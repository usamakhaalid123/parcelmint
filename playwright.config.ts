import { defineConfig, devices } from "@playwright/test";

const requestedPort = Number(process.env.E2E_PORT ?? "3100");
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535) {
  throw new Error("E2E_PORT must be an integer between 1 and 65535.");
}
const e2ePort = String(requestedPort);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? { channel: "chrome" } : {}),
      },
    },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `corepack pnpm dev --hostname 127.0.0.1 --port ${e2ePort}`,
    env: {
      DEPLOYMENT_ENV: "local",
      NEXT_PUBLIC_APP_URL: e2eBaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "playwright-anonymous-test-key",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    },
    url: `${e2eBaseUrl}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
