export type VerificationState = "pending" | "confirmed" | "rejected" | "expired";
export type FulfillmentState = "unfulfilled" | "processing" | "packed" | "fulfilled" | "cancelled";
export type ShipmentState =
  | "pending"
  | "label_created"
  | "handed_to_courier"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "attempt_failed"
  | "return_to_origin"
  | "returned_to_sender"
  | "lost"
  | "damaged"
  | "cancelled";

const fulfillmentTransitions: Readonly<Record<FulfillmentState, readonly FulfillmentState[]>> = {
  unfulfilled: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

const shipmentTransitions: Readonly<Record<ShipmentState, readonly ShipmentState[]>> = {
  pending: ["label_created", "cancelled"],
  label_created: ["handed_to_courier", "cancelled"],
  handed_to_courier: ["in_transit", "lost", "damaged"],
  in_transit: ["out_for_delivery", "attempt_failed", "return_to_origin", "lost", "damaged"],
  out_for_delivery: ["delivered", "attempt_failed", "return_to_origin", "lost", "damaged"],
  attempt_failed: ["out_for_delivery", "return_to_origin", "lost", "damaged"],
  return_to_origin: ["returned_to_sender", "lost", "damaged"],
  delivered: [],
  returned_to_sender: [],
  lost: [],
  damaged: [],
  cancelled: [],
};

export function canTransitionVerification(
  previous: VerificationState,
  next: VerificationState,
): boolean {
  return previous === "pending" && ["confirmed", "rejected", "expired"].includes(next);
}

export function canTransitionFulfillment(
  previous: FulfillmentState,
  next: FulfillmentState,
): boolean {
  return fulfillmentTransitions[previous].includes(next);
}

export function canTransitionShipment(previous: ShipmentState, next: ShipmentState): boolean {
  return shipmentTransitions[previous].includes(next);
}

export function permittedFulfillmentTransitions(state: FulfillmentState) {
  return fulfillmentTransitions[state];
}

export function permittedShipmentTransitions(state: ShipmentState) {
  return shipmentTransitions[state];
}
