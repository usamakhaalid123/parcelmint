import { describe, expect, it } from "vitest";

import { calculateCouponDiscount, calculatePricing } from "@/modules/checkout/domain/pricing";
import { checkoutInputSchema } from "@/modules/checkout/schemas/checkout-input";

describe("checkout pricing", () => {
  it("calculates percentage discounts in basis points with a maximum", () => {
    expect(
      calculateCouponDiscount(10_000, {
        discountType: "percentage",
        discountValue: 2_000,
        maximumDiscountMinor: 1_500,
        minimumSubtotalMinor: 0,
      }),
    ).toBe(1_500);
  });

  it("allocates the exact discount across order lines", () => {
    const result = calculatePricing(
      [
        { id: "first", quantity: 1, unitPriceMinor: 1_001 },
        { id: "second", quantity: 2, unitPriceMinor: 500 },
      ],
      250,
      {
        discountType: "fixed",
        discountValue: 301,
        maximumDiscountMinor: null,
        minimumSubtotalMinor: 0,
      },
    );

    expect(result).toMatchObject({
      discountMinor: 301,
      grandTotalMinor: 1_950,
      shippingMinor: 250,
      subtotalMinor: 2_001,
      taxMinor: 0,
    });
    expect([...result.lineDiscounts.values()].reduce((total, value) => total + value, 0)).toBe(301);
  });

  it("never discounts more than the subtotal and supports zero-priced items", () => {
    expect(
      calculatePricing([{ id: "free", quantity: 1, unitPriceMinor: 0 }], 0, {
        discountType: "fixed",
        discountValue: 500,
        maximumDiscountMinor: null,
        minimumSubtotalMinor: 0,
      }),
    ).toMatchObject({ discountMinor: 0, grandTotalMinor: 0, subtotalMinor: 0 });
  });
});

describe("checkout input", () => {
  it("normalizes phone spacing and optional fields", () => {
    const result = checkoutInputSchema.parse({
      addressLine: "12 Example Street",
      customerName: "Guest Buyer",
      deliveryInstructions: "",
      deliveryZoneId: "00000000-0000-4000-8000-000000000001",
      email: "",
      idempotencyKey: "00000000-0000-4000-8000-000000000002",
      landmark: "",
      mobileNumber: "+92 300 1234567",
      policyConsent: "on",
      postalCode: "",
    });

    expect(result.mobileNumber).toBe("+923001234567");
    expect(result.email).toBeNull();
    expect(result.deliveryInstructions).toBeNull();
  });
});
