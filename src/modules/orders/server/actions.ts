"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import {
  addAdminNote,
  cancelOrder,
  confirmOrderManually,
  createShipmentLabel,
  handoffOrder,
  recordDeliveryAttempt,
  rejectOrder,
  transitionFulfillment,
  transitionShipment,
} from "@/modules/orders/server/order-service";
import type { ShipmentState } from "@/modules/orders/domain/state-policy";

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function runOrderAction(
  formData: FormData,
  operation: (base: {
    actor: Awaited<ReturnType<typeof getCurrentPrincipal>>;
    correlationId: string;
    orderId: string;
    reason: string;
  }) => Promise<void>,
): Promise<never> {
  const orderId = stringValue(formData, "orderId");
  const correlationId = randomUUID();
  try {
    await operation({
      actor: await getCurrentPrincipal(),
      correlationId,
      orderId,
      reason: stringValue(formData, "reason"),
    });
  } catch (error) {
    logger.warn("Order operation failed", { correlationId, error, orderId });
    redirect(`/admin/orders/${orderId}?error=operation_failed`);
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  redirect(`/admin/orders/${orderId}?notice=updated`);
}

export async function confirmOrderAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) => confirmOrderManually(base));
}

export async function rejectOrderAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) => rejectOrder(base));
}

export async function startProcessingAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) =>
    transitionFulfillment({ ...base, nextState: "processing" }),
  );
}

export async function markPackedAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) =>
    transitionFulfillment({ ...base, nextState: "packed" }),
  );
}

export async function createShipmentLabelAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) =>
    createShipmentLabel({
      ...base,
      courierCode: stringValue(formData, "courierCode"),
      trackingNumber: stringValue(formData, "trackingNumber"),
    }),
  );
}

export async function handoffOrderAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) => handoffOrder(base));
}

export async function transitionShipmentAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) =>
    transitionShipment({
      ...base,
      nextState: stringValue(formData, "nextState") as ShipmentState,
    }),
  );
}

export async function recordDeliveryAttemptAction(formData: FormData): Promise<never> {
  const outcome = stringValue(formData, "outcome");
  return runOrderAction(formData, (base) =>
    recordDeliveryAttempt({
      ...base,
      outcome:
        outcome === "delivered" || outcome === "refused" || outcome === "rescheduled"
          ? outcome
          : "failed",
    }),
  );
}

export async function cancelOrderAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) => cancelOrder(base));
}

export async function addAdminNoteAction(formData: FormData): Promise<never> {
  return runOrderAction(formData, (base) =>
    addAdminNote({ ...base, note: stringValue(formData, "note") }),
  );
}
