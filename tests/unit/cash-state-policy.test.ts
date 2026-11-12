import { describe, expect, it } from "vitest";

import { canTransitionCodCash } from "@/modules/reporting/domain/cash-state-policy";

describe("COD cash state policy", () => {
  it("allows the successful collection and reconciliation path", () => {
    expect(canTransitionCodCash("not_due", "collection_due")).toBe(true);
    expect(canTransitionCodCash("collection_due", "collected_by_courier")).toBe(true);
    expect(canTransitionCodCash("collected_by_courier", "remittance_pending")).toBe(true);
    expect(canTransitionCodCash("remittance_pending", "reconciled")).toBe(true);
  });

  it("supports explicit exception outcomes without permitting regressions", () => {
    expect(canTransitionCodCash("collection_due", "collection_failed")).toBe(true);
    expect(canTransitionCodCash("remittance_pending", "disputed")).toBe(true);
    expect(canTransitionCodCash("disputed", "written_off")).toBe(true);
    expect(canTransitionCodCash("reconciled", "remittance_pending")).toBe(false);
    expect(canTransitionCodCash("written_off", "reconciled")).toBe(false);
  });
});
