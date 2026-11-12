"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import {
  reconcileCashCollection,
  recordCollectionFailure,
  recordCourierCollection,
  recordRemittanceBatch,
  resolveCashDiscrepancy,
  writeOffFailedCollection,
} from "@/modules/reporting/server/cash-service";

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function amount(formData: FormData, key: string): number {
  return Number(value(formData, key));
}

function resolution(formData: FormData): "accept_actual" | "write_off" {
  const candidate = value(formData, "resolution");
  if (candidate === "accept_actual" || candidate === "write_off") return candidate;
  throw new Error("invalid_resolution");
}

async function base(formData: FormData) {
  return {
    actor: await getCurrentPrincipal(),
    correlationId: randomUUID(),
    orderId: value(formData, "orderId"),
    reason: value(formData, "reason"),
  };
}

function done(notice: string): never {
  revalidatePath("/admin/cash");
  revalidatePath("/admin/reports");
  redirect(`/admin/cash?notice=${notice}`);
}

function failed(): never {
  redirect("/admin/cash?error=operation_failed");
}

export async function recordCourierCollectionAction(formData: FormData): Promise<never> {
  try {
    await recordCourierCollection({
      ...(await base(formData)),
      collectedAmountMinor: amount(formData, "collectedAmountMinor"),
      collectedAt: new Date(value(formData, "collectedAt")),
      courierReference: value(formData, "courierReference"),
    });
  } catch {
    failed();
  }
  done("collection_recorded");
}

export async function recordCollectionFailureAction(formData: FormData): Promise<never> {
  try {
    await recordCollectionFailure(await base(formData));
  } catch {
    failed();
  }
  done("collection_failed");
}

export async function writeOffFailedCollectionAction(formData: FormData): Promise<never> {
  try {
    await writeOffFailedCollection(await base(formData));
  } catch {
    failed();
  }
  done("collection_written_off");
}

export async function recordRemittanceBatchAction(formData: FormData): Promise<never> {
  try {
    await recordRemittanceBatch({
      ...(await base(formData)),
      remittanceBatch: value(formData, "remittanceBatch"),
    });
  } catch {
    failed();
  }
  done("remittance_recorded");
}

export async function reconcileCashCollectionAction(formData: FormData): Promise<never> {
  try {
    const result = await reconcileCashCollection({
      ...(await base(formData)),
      remittedAmountMinor: amount(formData, "remittedAmountMinor"),
    });
    done(result.discrepancy ? "discrepancy_opened" : "cash_reconciled");
  } catch {
    failed();
  }
}

export async function resolveCashDiscrepancyAction(formData: FormData): Promise<never> {
  try {
    await resolveCashDiscrepancy({
      ...(await base(formData)),
      resolution: resolution(formData),
    });
  } catch {
    failed();
  }
  done("discrepancy_resolved");
}
