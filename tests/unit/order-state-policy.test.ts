import { describe, expect, it } from "vitest";

import {
  canTransitionFulfillment,
  canTransitionShipment,
  canTransitionVerification,
  permittedShipmentTransitions,
} from "@/modules/orders";

describe("order operation state policy", () => {
  it("allows verification only from pending to a terminal result", () => {
    expect(canTransitionVerification("pending", "confirmed")).toBe(true);
    expect(canTransitionVerification("confirmed", "pending")).toBe(false);
    expect(canTransitionVerification("rejected", "confirmed")).toBe(false);
  });

  it("requires fulfillment to progress in order", () => {
    expect(canTransitionFulfillment("unfulfilled", "processing")).toBe(true);
    expect(canTransitionFulfillment("processing", "packed")).toBe(true);
    expect(canTransitionFulfillment("packed", "fulfilled")).toBe(true);
    expect(canTransitionFulfillment("unfulfilled", "fulfilled")).toBe(false);
    expect(canTransitionFulfillment("fulfilled", "cancelled")).toBe(false);
  });

  it("rejects shipment regressions and skipped delivery states", () => {
    expect(canTransitionShipment("handed_to_courier", "in_transit")).toBe(true);
    expect(canTransitionShipment("in_transit", "delivered")).toBe(false);
    expect(canTransitionShipment("delivered", "out_for_delivery")).toBe(false);
    expect(permittedShipmentTransitions("out_for_delivery")).toContain("attempt_failed");
  });
});
