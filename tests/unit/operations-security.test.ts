import { describe, expect, it } from "vitest";

import {
  parseCourierWebhookSecret,
  parseSupabaseServiceRoleKey,
  parseWorkerInvocationSecret,
} from "@/config/operations-env";
import { EnvironmentConfigurationError } from "@/config/env";
import { secretsMatch } from "@/lib/constant-time-secret";
import { resolveSafeRedirectPath } from "@/modules/auth/domain/safe-redirect";

describe("operations security boundaries", () => {
  it("requires strong server-only operational secrets", () => {
    expect(() => parseWorkerInvocationSecret({ WORKER_INVOCATION_SECRET: "short" })).toThrow(
      EnvironmentConfigurationError,
    );
    expect(() => parseSupabaseServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: "short" })).toThrow(
      EnvironmentConfigurationError,
    );
    expect(() => parseCourierWebhookSecret({ COURIER_WEBHOOK_SECRET: "short" })).toThrow(
      EnvironmentConfigurationError,
    );

    expect(parseWorkerInvocationSecret({ WORKER_INVOCATION_SECRET: "a".repeat(32) })).toHaveLength(
      32,
    );
  });

  it("compares invocation credentials without accepting missing or partial values", () => {
    const expected = `Bearer ${"a".repeat(32)}`;

    expect(secretsMatch(expected, expected)).toBe(true);
    expect(secretsMatch(null, expected)).toBe(false);
    expect(secretsMatch(`Bearer ${"a".repeat(31)}`, expected)).toBe(false);
    expect(secretsMatch(`Bearer ${"b".repeat(32)}`, expected)).toBe(false);
  });

  it("allows local callback paths and rejects external redirects", () => {
    expect(resolveSafeRedirectPath("/account/orders?from=login")).toBe(
      "/account/orders?from=login",
    );
    expect(resolveSafeRedirectPath("https://attacker.example/path")).toBe("/");
    expect(resolveSafeRedirectPath("//attacker.example/path")).toBe("/");
    expect(resolveSafeRedirectPath(null, "/admin")).toBe("/admin");
  });
});
