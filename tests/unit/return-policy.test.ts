import { describe, expect, it } from "vitest";

import {
  canTransitionReturn,
  isCustomerCancellationEligible,
  isReturnRequestEligible,
  permittedReturnTransitions,
  validateReturnDisposition,
  validateReturnQuantities,
} from "@/modules/orders/domain/return-policy";

describe("return policy", () => {
  it("allows only the documented return state transitions", () => {
    expect(permittedReturnTransitions("requested")).toEqual(["approved", "rejected", "cancelled"]);
    expect(canTransitionReturn("approved", "in_transit")).toBe(true);
    expect(canTransitionReturn("in_transit", "received")).toBe(true);
    expect(canTransitionReturn("received", "resolved")).toBe(false);
    expect(canTransitionReturn("resolved", "requested")).toBe(false);
  });

  it("permits customer cancellation only before courier handoff", () => {
    expect(
      isCustomerCancellationEligible({
        fulfillmentState: "processing",
        lifecycleState: "active",
        shipmentState: "pending",
      }),
    ).toBe(true);
    expect(
      isCustomerCancellationEligible({
        fulfillmentState: "fulfilled",
        lifecycleState: "active",
        shipmentState: "handed_to_courier",
      }),
    ).toBe(false);
    expect(
      isCustomerCancellationEligible({
        fulfillmentState: "unfulfilled",
        lifecycleState: "cancelled",
        shipmentState: null,
      }),
    ).toBe(false);
  });

  it("enforces the return window", () => {
    const deliveredAt = new Date("2026-01-01T00:00:00.000Z");
    expect(
      isReturnRequestEligible({
        deliveredAt,
        now: new Date("2026-01-15T00:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isReturnRequestEligible({
        deliveredAt,
        now: new Date("2026-01-15T00:00:00.001Z"),
      }),
    ).toBe(false);
    expect(isReturnRequestEligible({ deliveredAt: null, now: deliveredAt })).toBe(false);
  });

  it("prevents cumulative partial returns from exceeding the ordered quantity", () => {
    expect(validateReturnQuantities({ alreadyRequested: 1, ordered: 3, requested: 2 })).toBe(true);
    expect(validateReturnQuantities({ alreadyRequested: 2, ordered: 3, requested: 2 })).toBe(false);
    expect(validateReturnQuantities({ alreadyRequested: 0, ordered: 3, requested: 0 })).toBe(false);
  });

  it("allows only received units to be marked sellable", () => {
    expect(validateReturnDisposition({ approved: 3, received: 2, sellable: 1 })).toBe(true);
    expect(validateReturnDisposition({ approved: 2, received: 3, sellable: 1 })).toBe(false);
    expect(validateReturnDisposition({ approved: 2, received: 1, sellable: 2 })).toBe(false);
  });
});
