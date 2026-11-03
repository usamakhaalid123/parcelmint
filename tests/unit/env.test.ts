import { describe, expect, it } from "vitest";

import { EnvironmentConfigurationError, parseServerEnvironment } from "@/config/env";

describe("parseServerEnvironment", () => {
  it("uses safe local defaults", () => {
    expect(parseServerEnvironment({})).toEqual({
      appUrl: "http://localhost:3000",
      deployment: "local",
      logLevel: "info",
    });
  });

  it("requires an application URL in production", () => {
    expect(() => parseServerEnvironment({ DEPLOYMENT_ENV: "production" })).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it("accepts a valid production environment", () => {
    expect(
      parseServerEnvironment({
        DEPLOYMENT_ENV: "production",
        LOG_LEVEL: "warn",
        NEXT_PUBLIC_APP_URL: "https://shop.example.com",
      }),
    ).toEqual({
      appUrl: "https://shop.example.com",
      deployment: "production",
      logLevel: "warn",
    });
  });

  it("rejects insecure URLs outside local development", () => {
    expect(() =>
      parseServerEnvironment({
        DEPLOYMENT_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "http://staging.example.com",
      }),
    ).toThrow("must use HTTPS outside local development");
  });
});
