"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import {
  createOperationalBlock,
  removeOperationalBlock,
} from "@/modules/orders/server/blocklist-service";

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createOperationalBlockAction(formData: FormData): Promise<never> {
  const expiresAtValue = stringValue(formData, "expiresAt");
  await createOperationalBlock({
    actor: await getCurrentPrincipal(),
    correlationId: randomUUID(),
    expiresAt: expiresAtValue === "" ? null : new Date(expiresAtValue),
    reason: stringValue(formData, "reason"),
    type: stringValue(formData, "type") === "address" ? "address" : "mobile",
    value: stringValue(formData, "value"),
  });
  revalidatePath("/admin/blocks");
  redirect("/admin/blocks?notice=created");
}

export async function removeOperationalBlockAction(formData: FormData): Promise<never> {
  await removeOperationalBlock({
    actor: await getCurrentPrincipal(),
    blockId: stringValue(formData, "blockId"),
    correlationId: randomUUID(),
    reason: stringValue(formData, "reason"),
  });
  revalidatePath("/admin/blocks");
  redirect("/admin/blocks?notice=removed");
}
