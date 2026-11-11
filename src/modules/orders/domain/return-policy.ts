export type ReturnState =
  | "requested"
  | "approved"
  | "in_transit"
  | "received"
  | "inspected"
  | "resolved"
  | "rejected"
  | "cancelled";

const returnTransitions: Readonly<Record<ReturnState, readonly ReturnState[]>> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["in_transit", "cancelled"],
  in_transit: ["received"],
  received: ["inspected"],
  inspected: ["resolved"],
  resolved: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionReturn(previous: ReturnState, next: ReturnState): boolean {
  return returnTransitions[previous].includes(next);
}

export function permittedReturnTransitions(state: ReturnState): readonly ReturnState[] {
  return returnTransitions[state];
}

export function isCustomerCancellationEligible(input: {
  fulfillmentState: "cancelled" | "fulfilled" | "packed" | "processing" | "unfulfilled";
  lifecycleState: "active" | "cancelled" | "closed";
  shipmentState: string | null;
}): boolean {
  return (
    input.lifecycleState === "active" &&
    input.fulfillmentState !== "fulfilled" &&
    input.fulfillmentState !== "cancelled" &&
    (input.shipmentState === null ||
      input.shipmentState === "pending" ||
      input.shipmentState === "label_created")
  );
}

export function isReturnRequestEligible(input: {
  deliveredAt: Date | null;
  now: Date;
  returnWindowDays?: number;
}): boolean {
  if (input.deliveredAt === null) return false;
  const windowDays = input.returnWindowDays ?? 14;
  if (!Number.isInteger(windowDays) || windowDays < 1) return false;
  const closesAt = new Date(input.deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
  return input.now >= input.deliveredAt && input.now <= closesAt;
}

export function validateReturnQuantities(input: {
  alreadyRequested: number;
  ordered: number;
  requested: number;
}): boolean {
  return (
    Number.isInteger(input.alreadyRequested) &&
    Number.isInteger(input.ordered) &&
    Number.isInteger(input.requested) &&
    input.alreadyRequested >= 0 &&
    input.ordered > 0 &&
    input.requested > 0 &&
    input.alreadyRequested + input.requested <= input.ordered
  );
}

export function validateReturnDisposition(input: {
  approved: number;
  received: number;
  sellable: number;
}): boolean {
  return (
    Number.isInteger(input.approved) &&
    Number.isInteger(input.received) &&
    Number.isInteger(input.sellable) &&
    input.approved >= 0 &&
    input.received >= 0 &&
    input.sellable >= 0 &&
    input.received <= input.approved &&
    input.sellable <= input.received
  );
}
