"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerEnvironment } from "@/config/env";
import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import {
  deleteCustomerAddress,
  saveCustomerAddress,
} from "@/modules/orders/server/customer-account-service";
import { createCustomerTrackingSession } from "@/modules/orders/server/tracking-service";

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function saveCustomerAddressAction(formData: FormData): Promise<never> {
  try {
    const principal = await getCurrentPrincipal();
    if (principal === null) throw new Error("customer_access_denied");
    await saveCustomerAddress(principal, {
      addressLine: value(formData, "addressLine"),
      deliveryArea: value(formData, "deliveryArea"),
      isDefault: value(formData, "isDefault") === "on",
      label: value(formData, "label"),
      landmark: value(formData, "landmark") || null,
      mobileNumber: value(formData, "mobileNumber"),
      postalCode: value(formData, "postalCode") || null,
      recipientName: value(formData, "recipientName"),
    });
  } catch {
    redirect("/account?error=address_failed");
  }
  revalidatePath("/account");
  redirect("/account?notice=address_saved");
}

export async function deleteCustomerAddressAction(formData: FormData): Promise<never> {
  try {
    const principal = await getCurrentPrincipal();
    if (principal === null) throw new Error("customer_access_denied");
    await deleteCustomerAddress(principal, value(formData, "addressId"));
  } catch {
    redirect("/account?error=address_failed");
  }
  revalidatePath("/account");
  redirect("/account?notice=address_removed");
}

export async function openCustomerOrderAction(formData: FormData): Promise<never> {
  let session: Awaited<ReturnType<typeof createCustomerTrackingSession>>;
  try {
    const principal = await getCurrentPrincipal();
    if (principal === null || principal.accountType !== "customer" || principal.status !== "active")
      throw new Error("customer_access_denied");
    session = await createCustomerTrackingSession(principal.userId, value(formData, "orderNumber"));
  } catch {
    redirect("/account?error=order_access_denied");
  }

  const cookieStore = await cookies();
  cookieStore.set("parcelmint_tracking", session.token, {
    httpOnly: true,
    maxAge: 30 * 60,
    path: "/track",
    sameSite: "lax",
    secure: getServerEnvironment().deployment !== "local",
  });
  redirect(`/track/${session.orderNumber}`);
}
