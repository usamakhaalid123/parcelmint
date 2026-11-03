import { describe, expect, it } from "vitest";

import { decideOutboxRetry } from "@/modules/jobs";

describe("decideOutboxRetry", () => {
  const now = new Date("2026-11-02T12:00:00.000Z");

  it("uses bounded exponential backoff", () => {
    expect(
      decideOutboxRetry(3, now, {
        baseDelayMilliseconds: 1_000,
        maximumAttempts: 5,
        maximumDelayMilliseconds: 3_000,
      }),
    ).toEqual({
      availableAt: new Date("2026-11-02T12:00:03.000Z"),
      outcome: "retry",
    });
  });

  it("moves exhausted work to dead letter", () => {
    expect(
      decideOutboxRetry(5, now, {
        baseDelayMilliseconds: 1_000,
        maximumAttempts: 5,
        maximumDelayMilliseconds: 3_000,
      }),
    ).toEqual({ outcome: "dead_letter" });
  });

  it("rejects an invalid completed-attempt count", () => {
    expect(() => decideOutboxRetry(0, now)).toThrow(RangeError);
  });
});
