export type CodCashState =
  | "not_due"
  | "collection_due"
  | "collected_by_courier"
  | "remittance_pending"
  | "reconciled"
  | "collection_failed"
  | "disputed"
  | "written_off";

const transitions: Readonly<Record<CodCashState, readonly CodCashState[]>> = {
  not_due: ["collection_due"],
  collection_due: ["collected_by_courier", "collection_failed"],
  collected_by_courier: ["remittance_pending"],
  remittance_pending: ["reconciled", "disputed"],
  collection_failed: ["collected_by_courier", "written_off"],
  disputed: ["reconciled", "written_off"],
  reconciled: [],
  written_off: [],
};

export function canTransitionCodCash(from: CodCashState, to: CodCashState): boolean {
  return transitions[from].includes(to);
}
