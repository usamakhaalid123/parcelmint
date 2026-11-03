import { describe, expect, it } from "vitest";

import { createLogEntry } from "@/lib/logger";

describe("createLogEntry", () => {
  it("redacts sensitive fields at every nesting level", () => {
    const entry = createLogEntry(
      "info",
      "Order lookup requested",
      {
        orderId: "order-123",
        profile: {
          email: "customer@example.com",
          phoneNumber: "+10000000000",
        },
        sessionToken: "secret-value",
      },
      new Date("2026-01-02T03:04:05.000Z"),
    );

    expect(entry).toEqual({
      context: {
        orderId: "order-123",
        profile: {
          email: "[REDACTED]",
          phoneNumber: "[REDACTED]",
        },
        sessionToken: "[REDACTED]",
      },
      level: "info",
      message: "Order lookup requested",
      timestamp: "2026-01-02T03:04:05.000Z",
    });
  });

  it("handles circular context without throwing", () => {
    const context: Record<string, unknown> = {};
    context.self = context;

    expect(createLogEntry("warn", "Circular input", context).context).toEqual({
      self: "[CIRCULAR]",
    });
  });
});
