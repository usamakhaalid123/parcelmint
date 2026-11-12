import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Alert, Button } from "@/components/ui";
import { signOutCustomer } from "@/modules/auth/server/customer-auth";
import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import {
  deleteCustomerAddressAction,
  openCustomerOrderAction,
  saveCustomerAddressAction,
} from "@/modules/orders/server/customer-account-actions";
import { getCustomerAccount } from "@/modules/orders/server/customer-account-service";
import { formatMoney } from "@/modules/storefront/components/product-card";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "My account" };
export const dynamic = "force-dynamic";

export default async function CustomerAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const principal = await getCurrentPrincipal();
  if (principal?.accountType !== "customer" || principal.status !== "active")
    redirect("/account/sign-in");
  const [account, query] = await Promise.all([getCustomerAccount(principal), searchParams]);
  return (
    <StorefrontMain>
      <section className="py-16">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Customer account</p>
            <h1>{account.profile?.displayName ?? "My account"}</h1>
          </div>
          <form action={signOutCustomer}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
        {query.notice ? <Alert tone="success">Account updated.</Alert> : null}
        {query.error ? <Alert tone="error">The update could not be completed.</Alert> : null}
        <section className="mt-10">
          <h2>Order history</h2>
          {account.orders.length === 0 ? (
            <p>No account orders yet. Guest orders remain available through secure tracking.</p>
          ) : (
            <ul className="grid gap-3">
              {account.orders.map((order) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-4"
                  key={order.id}
                >
                  <span>
                    <strong>{order.orderNumber}</strong> ·{" "}
                    {order.fulfillmentState.replaceAll("_", " ")} ·{" "}
                    {formatMoney(order.grandTotalMinor, order.currencyCode)}
                  </span>
                  <form action={openCustomerOrderAction}>
                    <input name="orderNumber" type="hidden" value={order.orderNumber} />
                    <Button type="submit" variant="secondary">
                      View and manage
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="mt-10">
          <h2>Saved addresses</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {account.addresses.map((address) => (
              <article className="rounded-xl bg-surface p-4" key={address.id}>
                <strong>
                  {address.label}
                  {address.isDefault ? " · Default" : ""}
                </strong>
                <p>
                  {address.recipientName}
                  <br />
                  {address.addressLine}
                  <br />
                  {address.deliveryArea}
                </p>
                <form action={deleteCustomerAddressAction}>
                  <input name="addressId" type="hidden" value={address.id} />
                  <Button type="submit" variant="secondary">
                    Remove
                  </Button>
                </form>
              </article>
            ))}
          </div>
          <form
            action={saveCustomerAddressAction}
            className="mt-6 grid gap-3 rounded-2xl bg-surface p-6 md:grid-cols-2"
          >
            <h3 className="md:col-span-2">Add address</h3>
            <label>
              Label
              <input name="label" required />
            </label>
            <label>
              Recipient name
              <input name="recipientName" required />
            </label>
            <label>
              Mobile
              <input name="mobileNumber" required type="tel" />
            </label>
            <label>
              Delivery area
              <input name="deliveryArea" required />
            </label>
            <label className="md:col-span-2">
              Address
              <input name="addressLine" required />
            </label>
            <label>
              Landmark
              <input name="landmark" />
            </label>
            <label>
              Postal code
              <input name="postalCode" />
            </label>
            <label className="md:col-span-2">
              <input name="isDefault" type="checkbox" /> Make default
            </label>
            <Button className="md:col-span-2" type="submit">
              Save address
            </Button>
          </form>
        </section>
      </section>
    </StorefrontMain>
  );
}
