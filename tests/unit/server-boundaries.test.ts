import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as invokeOutboxWorker } from "@/app/api/v1/jobs/outbox/route";
import { GET as handleAuthCallback } from "@/app/auth/callback/route";

const originalWorkerSecret = process.env.WORKER_INVOCATION_SECRET;

describe("phase 1 server boundaries", () => {
  beforeEach(() => {
    process.env.WORKER_INVOCATION_SECRET = "phase1-test-secret-that-is-long-enough";
  });

  afterEach(() => {
    if (originalWorkerSecret === undefined) {
      delete process.env.WORKER_INVOCATION_SECRET;
    } else {
      process.env.WORKER_INVOCATION_SECRET = originalWorkerSecret;
    }
  });

  it("rejects worker calls without the invocation secret before database access", async () => {
    const response = await invokeOutboxWorker(
      new Request("https://shop.example.com/api/v1/jobs/outbox", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication is required" },
    });
  });

  it("rejects callbacks without an authorization code before session access", async () => {
    const response = await handleAuthCallback(
      new Request("https://shop.example.com/auth/callback?next=https://attacker.example"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://shop.example.com/admin/sign-in?error=invalid_callback",
    );
  });
});
