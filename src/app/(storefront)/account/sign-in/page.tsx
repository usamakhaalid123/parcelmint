import type { Metadata } from "next";

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
          <p className="form-alert">The account request could not be completed.</p>
        ) : null}
        {query.notice ? (
          <p className="rounded-xl bg-green-50 p-4 text-green-900">
            Check your email to confirm your account.
          </p>
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
            <button className="button-primary" type="submit">
              Sign in
            </button>
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
            <button className="button-secondary" type="submit">
              Create account
            </button>
          </form>
        </div>
      </section>
    </StorefrontMain>
  );
}
