import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

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
          <p className="rounded-xl bg-amber-50 p-4 text-amber-900">
            Local development code: <strong>{query.developmentCode}</strong>
          </p>
        ) : null}
        {query.error ? (
          <p className="rounded-xl bg-red-50 p-4 text-red-800">The code is invalid or expired.</p>
        ) : null}
        <form
          action={verifyTrackingCodeAction}
          className="mt-8 grid gap-4 rounded-2xl bg-surface p-6"
        >
          <input name="challengeId" type="hidden" value={challenge.data} />
          <label>
            Verification code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
            />
          </label>
          <button className="button-primary" type="submit">
            Verify and view order
          </button>
        </form>
      </section>
    </StorefrontMain>
  );
}
