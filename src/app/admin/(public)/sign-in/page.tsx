import { signInStaff } from "@/modules/auth/server/sign-in";

export const dynamic = "force-dynamic";

const safeErrors: Readonly<Record<string, string>> = {
  access_denied: "This account does not have staff access.",
  invalid_callback: "The authentication link is invalid or expired.",
  invalid_credentials: "The email or password is incorrect.",
};

export default async function StaffSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const errorCode = (await searchParams).error;
  const errorMessage = errorCode === undefined ? undefined : safeErrors[errorCode];

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-card" aria-labelledby="staff-sign-in-title">
        <p className="eyebrow">Staff administration</p>
        <h1 id="staff-sign-in-title">Sign in to continue.</h1>
        <p>Administrative permissions are checked on the server for every protected operation.</p>

        {errorMessage === undefined ? null : (
          <p className="form-alert" role="alert">
            {errorMessage}
          </p>
        )}

        <form action={signInStaff} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input autoComplete="username" id="email" name="email" required type="email" />

          <label htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            id="password"
            minLength={1}
            name="password"
            required
            type="password"
          />

          <button className="primary-action" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
