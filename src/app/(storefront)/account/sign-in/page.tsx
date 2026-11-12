import type { Metadata } from "next";

import { Alert, Button } from "@/components/ui";
import { signInCustomer, signUpCustomer } from "@/modules/auth/server/customer-auth";
import { StorefrontMain } from "@/modules/storefront/components/storefront-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Customer account",
};

export default async function CustomerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  return (
    <StorefrontMain>
      <section className="py-16">
        <p className="eyebrow">Customer account</p>
        <h1>Sign in or create an account</h1>
        {query.error ? (
          <Alert tone="error">The account request could not be completed.</Alert>
        ) : null}
        {query.notice ? (
          <Alert tone="success">Check your email to confirm your account.</Alert>
        ) : null}
        <div className="grid gap-8 md:grid-cols-2">
          <form action={signInCustomer} className="auth-form rounded-2xl bg-surface p-6">
            <h2>Sign in</h2>
            <label>
              Email
              <input autoComplete="email" name="email" required type="email" />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
            <Button type="submit">Sign in</Button>
          </form>
          <form action={signUpCustomer} className="auth-form rounded-2xl bg-surface p-6">
            <h2>Create account</h2>
            <label>
              Name
              <input name="displayName" required />
            </label>
            <label>
              Mobile
              <input name="mobileNumber" required type="tel" />
            </label>
            <label>
              Email
              <input autoComplete="email" name="email" required type="email" />
            </label>
            <label>
              Password
              <input
                autoComplete="new-password"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
            <Button type="submit" variant="secondary">
              Create account
            </Button>
          </form>
        </div>
      </section>
    </StorefrontMain>
  );
}
