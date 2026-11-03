"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="status-page" id="main-content">
      <p className="eyebrow">Something went wrong</p>
      <h1>We could not load this page.</h1>
      <p>The error has been contained. Try the request again.</p>
      {error.digest ? <p>Reference: {error.digest}</p> : null}
      <button className="primary-action" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
