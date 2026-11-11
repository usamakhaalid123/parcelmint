# COD Commerce

A TypeScript modular-monolith foundation for a cash-on-delivery e-commerce platform. The canonical
product and engineering scope is in [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md).

GitHub repository: [usamakhaalid123/parcelmint](https://github.com/usamakhaalid123/parcelmint)

## Requirements

- Node.js 22.23.2 (configured in `.tool-versions`)
- Corepack
- pnpm 12.16.1 (pinned in `package.json`)

## Local setup

```bash
corepack enable
corepack install
cp .env.example .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The health endpoint is available at `/api/v1/health`.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

Use `pnpm validate` for the non-browser quality gates. Playwright browsers must be installed once with
`pnpm exec playwright install` before running end-to-end tests locally.

## Database foundation

Phase 1 database commands use the connection variables documented in `.env.example`:

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm db:provision-owner --identity-id UUID --reason "approved reason"
```

Review [`docs/operations/database.md`](docs/operations/database.md) before applying a migration or
seeding reference authorization data.

Staff bootstrap and worker operations are documented in
[`docs/operations/staff-access.md`](docs/operations/staff-access.md) and
[`docs/operations/outbox-worker.md`](docs/operations/outbox-worker.md).

Catalog, inventory, product-image storage, and CSV operations are documented in
[`docs/operations/catalog.md`](docs/operations/catalog.md).

Public catalog discovery, storefront caching, indexing rules, and browser-test isolation are
documented in [`docs/operations/storefront.md`](docs/operations/storefront.md).

Guest cart, checkout, pricing, idempotency, and reservation-expiry operations are documented in
[`docs/operations/checkout.md`](docs/operations/checkout.md).

COD verification, audited order transitions, fulfillment, shipments, delivery attempts, fraud
controls, and notification handling are documented in
[`docs/operations/fulfillment.md`](docs/operations/fulfillment.md).

## Repository guidance

Read `AGENTS.md` before changing the application. It routes work to the relevant sections of the
project specification and records the non-negotiable product invariants.

## Pending business decisions

The store identity, selling regions, currency, taxes, delivery rules, courier, COD limits,
verification method, customer policies, launch languages, and expected volume remain configurable
until the owner confirms them. Do not substitute invented production values.
