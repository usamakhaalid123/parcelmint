export type PricingLine = {
  id: string;
  quantity: number;
  unitPriceMinor: number;
};

export type PricingCoupon = {
  discountType: "fixed" | "percentage";
  discountValue: number;
  maximumDiscountMinor: number | null;
  minimumSubtotalMinor: number;
};

export type PricingResult = {
  discountMinor: number;
  grandTotalMinor: number;
  lineDiscounts: ReadonlyMap<string, number>;
  shippingMinor: number;
  subtotalMinor: number;
  taxMinor: number;
};

function assertMinorInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

export function calculateCouponDiscount(
  subtotalMinor: number,
  coupon: PricingCoupon | null,
): number {
  assertMinorInteger(subtotalMinor, "subtotalMinor");
  if (coupon === null || subtotalMinor < coupon.minimumSubtotalMinor) return 0;

  const rawDiscount =
    coupon.discountType === "fixed"
      ? coupon.discountValue
      : Math.floor((subtotalMinor * coupon.discountValue) / 10_000);
  const capped =
    coupon.maximumDiscountMinor === null
      ? rawDiscount
      : Math.min(rawDiscount, coupon.maximumDiscountMinor);
  return Math.min(subtotalMinor, capped);
}

export function calculatePricing(
  lines: readonly PricingLine[],
  shippingMinor: number,
  coupon: PricingCoupon | null,
): PricingResult {
  assertMinorInteger(shippingMinor, "shippingMinor");
  if (lines.length === 0) throw new RangeError("at least one pricing line is required");

  const lineSubtotals = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError("line quantity must be a positive integer");
    }
    assertMinorInteger(line.unitPriceMinor, "unitPriceMinor");
    const subtotal = line.quantity * line.unitPriceMinor;
    assertMinorInteger(subtotal, "line subtotal");
    return { id: line.id, subtotal };
  });
  const subtotalMinor = lineSubtotals.reduce((total, line) => total + line.subtotal, 0);
  assertMinorInteger(subtotalMinor, "subtotalMinor");
  const discountMinor = calculateCouponDiscount(subtotalMinor, coupon);

  let allocated = 0;
  const lineDiscounts = new Map<string, number>();
  lineSubtotals.forEach((line, index) => {
    const discount =
      subtotalMinor === 0
        ? 0
        : index === lineSubtotals.length - 1
          ? discountMinor - allocated
          : Math.floor((discountMinor * line.subtotal) / subtotalMinor);
    lineDiscounts.set(line.id, discount);
    allocated += discount;
  });

  const taxMinor = 0;
  return {
    discountMinor,
    grandTotalMinor: subtotalMinor - discountMinor + shippingMinor + taxMinor,
    lineDiscounts,
    shippingMinor,
    subtotalMinor,
    taxMinor,
  };
}
