import type { Metadata } from "next";

import { Alert, Button, Card, FieldLabel, Input } from "@/components/ui";
import { requestTrackingCodeAction } from "@/modules/orders/server/tracking-actions";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Track order" };

export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return (
    <StorefrontMain>
      <section className="mx-auto max-w-xl py-16">
        <p className="eyebrow">Private order tracking</p>
        <h1>Track your order</h1>
        <p className="text-[var(--muted)]">
          Enter the order number and mobile number used at checkout. We will send a short-lived
          verification code when the details match.
        </p>
        {query.error ? <Alert tone="error">Please wait and try again.</Alert> : null}
        <Card className="mt-8">
          <form action={requestTrackingCodeAction} className="grid gap-4">
            <FieldLabel>
              Order number
              <Input autoComplete="off" maxLength={80} name="orderNumber" required />
            </FieldLabel>
            <FieldLabel>
              Mobile number
              <Input autoComplete="tel" maxLength={30} name="mobileNumber" required type="tel" />
            </FieldLabel>
            <Button type="submit">Send verification code</Button>
          </form>
        </Card>
        <p className="mt-4 text-sm text-[var(--muted)]">
          For privacy, this page gives the same response whether or not an order matches.
        </p>
      </section>
    </StorefrontMain>
  );
}
