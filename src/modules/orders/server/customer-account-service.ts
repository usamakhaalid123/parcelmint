import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { customerAddresses, customerProfiles, orders } from "@/db/schema";
import type { StaffPrincipal } from "@/modules/auth";

type Database = ReturnType<typeof getDatabase>;

export function requireCustomerPrincipal(principal: StaffPrincipal | null): StaffPrincipal {
  if (principal?.accountType !== "customer" || principal.status !== "active") {
    throw new Error("customer_access_denied");
  }
  return principal;
}

export async function getCustomerAccount(
  principal: StaffPrincipal,
  database: Database = getDatabase(),
) {
  const customer = requireCustomerPrincipal(principal);
  const [profile, addresses, orderHistory] = await Promise.all([
    database
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, customer.userId))
      .limit(1),
    database
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerUserId, customer.userId))
      .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.updatedAt)),
    database
      .select({
        createdAt: orders.createdAt,
        currencyCode: orders.currencyCode,
        fulfillmentState: orders.fulfillmentState,
        grandTotalMinor: orders.grandTotalMinor,
        id: orders.id,
        lifecycleState: orders.lifecycleState,
        orderNumber: orders.orderNumber,
        verificationState: orders.verificationState,
      })
      .from(orders)
      .where(eq(orders.customerUserId, customer.userId))
      .orderBy(desc(orders.createdAt)),
  ]);
  return { addresses, orders: orderHistory, profile: profile[0] ?? null };
}

const addressSchema = z.object({
  addressLine: z.string().trim().min(5).max(500),
  deliveryArea: z.string().trim().min(2).max(120),
  isDefault: z.boolean(),
  label: z.string().trim().min(1).max(60),
  landmark: z.string().trim().max(200).nullable(),
  mobileNumber: z.string().trim().min(7).max(30),
  postalCode: z.string().trim().max(30).nullable(),
  recipientName: z.string().trim().min(2).max(120),
});

export async function saveCustomerAddress(
  principal: StaffPrincipal,
  input: z.input<typeof addressSchema>,
  database: Database = getDatabase(),
): Promise<void> {
  const customer = requireCustomerPrincipal(principal);
  const values = addressSchema.parse(input);
  await database.transaction(async (transaction) => {
    if (values.isDefault) {
      await transaction
        .update(customerAddresses)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(customerAddresses.customerUserId, customer.userId));
    }
    const [existing] = await transaction
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerUserId, customer.userId))
      .limit(1);
    await transaction.insert(customerAddresses).values({
      ...values,
      customerUserId: customer.userId,
      isDefault: values.isDefault || existing === undefined,
    });
  });
}

export async function deleteCustomerAddress(
  principal: StaffPrincipal,
  addressId: string,
  database: Database = getDatabase(),
): Promise<void> {
  const customer = requireCustomerPrincipal(principal);
  const id = z.string().uuid().parse(addressId);
  await database
    .delete(customerAddresses)
    .where(
      and(eq(customerAddresses.id, id), eq(customerAddresses.customerUserId, customer.userId)),
    );
}
