import Link from "next/link";

const foundations = [
  {
    eyebrow: "Customer experience",
    title: "A checkout built for confidence",
    description:
      "Guest checkout, clear delivery expectations, and traceable cash-on-delivery orders form the customer journey.",
  },
  {
    eyebrow: "Store operations",
    title: "Inventory and cash stay accountable",
    description:
      "Reservations, fulfillment, courier events, returns, and COD reconciliation remain separate and auditable.",
  },
  {
    eyebrow: "Engineering",
    title: "Safe foundations before features",
    description:
      "Strict TypeScript, server-owned rules, validation, automated checks, and observable failures guide each phase.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="COD Commerce home">
          COD<span>Commerce</span>
        </Link>
        <span className="phase-badge">Foundation phase</span>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Cash on delivery, designed as a complete operation</p>
          <h1 id="hero-title">Commerce that stays clear from order to reconciliation.</h1>
          <p className="hero-copy">
            The project foundation is ready for a secure storefront, dependable fulfillment, and
            transparent COD operations. Product features will arrive as verified vertical slices.
          </p>
          <a className="primary-action" href="#foundation">
            View the foundation
          </a>
        </section>

        <section className="foundation" id="foundation" aria-labelledby="foundation-title">
          <div className="section-heading">
            <p className="eyebrow">Phase 0</p>
            <h2 id="foundation-title">The standards behind the store</h2>
          </div>

          <div className="foundation-grid">
            {foundations.map((foundation) => (
              <article className="foundation-card" key={foundation.title}>
                <p>{foundation.eyebrow}</p>
                <h3>{foundation.title}</h3>
                <span>{foundation.description}</span>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <p>Built one verified phase at a time.</p>
      </footer>
    </>
  );
}
