import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="status-page" id="main-content">
      <p className="eyebrow">404</p>
      <h1>That page is not available.</h1>
      <p>Check the address or return to the storefront.</p>
      <Link className="primary-action" href="/">
        Return home
      </Link>
    </main>
  );
}
