import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Alert, Button, Card, FieldLabel, Input } from "@/components/ui";
import { verifyTrackingCodeAction } from "@/modules/orders/server/tracking-actions";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Verify order tracking",
};

export default async function VerifyTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string; developmentCode?: string; error?: string }>;
}) {
  const query = await searchParams;
  const challenge = z.string().uuid().safeParse(query.challenge);
  if (!challenge.success) notFound();
  return (
    <StorefrontMain>
      <section className="mx-auto max-w-xl py-16">
        <p className="eyebrow">Phone verification</p>
        <h1>Enter your six-digit code</h1>
        <p className="text-[var(--muted)]">
          The code expires after ten minutes and allows five attempts.
        </p>
        {query.developmentCode ? (
          <Alert tone="warning">
            Local development code: <strong>{query.developmentCode}</strong>
          </Alert>
        ) : null}
        {query.error ? <Alert tone="error">The code is invalid or expired.</Alert> : null}
        <Card className="mt-8">
          <form action={verifyTrackingCodeAction} className="grid gap-4">
            <input name="challengeId" type="hidden" value={challenge.data} />
            <FieldLabel>
              Verification code
              <Input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="code"
                pattern="[0-9]{6}"
                required
              />
            </FieldLabel>
            <Button type="submit">Verify and view order</Button>
          </form>
        </Card>
      </section>
    </StorefrontMain>
  );
}
