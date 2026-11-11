"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { cancelTrackedOrder, requestTrackedReturn } from "@/modules/orders/server/return-service";

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

async function trackingToken(): Promise<string> {
  const token = (await cookies()).get("parcelmint_tracking")?.value;
  if (token === undefined) throw new Error("order_access_denied");
  return token;
}

export async function cancelTrackedOrderAction(formData: FormData): Promise<never> {
  const orderNumber = value(formData, "orderNumber");
  try {
    await cancelTrackedOrder({
      orderNumber,
      reason: value(formData, "reason"),
      token: await trackingToken(),
    });
  } catch {
    redirect(`/track/${orderNumber}?error=cancellation_failed`);
  }
  redirect(`/track/${orderNumber}?notice=cancelled`);
}

export async function requestTrackedReturnAction(formData: FormData): Promise<never> {
  const orderNumber = value(formData, "orderNumber");
  try {
    await requestTrackedReturn({
      customerNotes: value(formData, "customerNotes") || undefined,
      orderItemId: value(formData, "orderItemId"),
      orderNumber,
      quantity: Number(value(formData, "quantity")),
      reason: value(formData, "reason"),
      token: await trackingToken(),
    });
  } catch {
    redirect(`/track/${orderNumber}?error=return_failed`);
  }
  redirect(`/track/${orderNumber}?notice=return_requested`);
}
