# Repository instructions

This repository contains a cash-on-delivery e-commerce platform. Preserve the product invariants below and use [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) as the canonical detailed specification.

## Read the relevant specification sections

Do not load the entire specification for a narrow task. Read:

- Sections 1–4 for product goals, assumptions, MVP scope, or scope decisions.
- Sections 5–8 for stack, architecture, repository structure, or coding conventions.
- Sections 9–12 for storefront, catalog, checkout, COD, state models, data model, or authorization.
- Sections 13–16 for security, privacy, SEO, performance, accessibility, integrations, jobs, or tests.
- Sections 18–24 for phase planning, deployment, recovery, environment variables, definition of done, launch, or metrics.

If a requested change crosses several areas, read only those sections. Read the whole specification only for a broad architecture, roadmap, or consistency review.

## Product invariants

- Guest cash-on-delivery checkout is required for the MVP; account creation cannot block purchase.
- The server is authoritative for price, discount, tax, shipping, inventory, permissions, and state transitions.
- Order creation and inventory reservation are one database transaction.
- Checkout and inbound integration events are idempotent.
- Order, verification, fulfillment, shipment, return, and COD cash states are separate concerns.
- Submitted order value, delivered merchandise value, cash collected, and cash reconciled are reported separately.
- Historical order items and addresses are immutable commercial snapshots.
- Inventory cannot become negative unless a separately approved backorder policy exists.
- Administrative permissions are server-enforced and default-deny; sensitive actions are audited.
- Customer and operational personal data must not leak into logs, analytics, errors, or public caches.

## Technical contract

- Use a TypeScript modular monolith: Next.js App Router and React for UI/server delivery, PostgreSQL for persistence, Drizzle for schema/query access, and Supabase for managed database/auth/storage initially.
- Use TypeScript strict mode. Do not use `any`, suppression comments, or unsafe casts to bypass a design problem.
- Use Server Components by default and Client Components only for browser interaction.
- Keep business rules in domain/application services, not React components, route handlers, or provider adapters.
- Validate external input at trust boundaries with Zod and authorize every protected mutation on the server.
- Represent money as integer minor units paired with an ISO 4217 currency code and explicit rounding rules.
- Store timestamps as UTC `timestamptz`; format them using the configured business timezone.
- Use database constraints and transactions for invariants; do not rely only on application checks.
- Send notifications and integration work through a transactional outbox processed by idempotent background jobs.
- Keep external providers behind narrow interfaces; do not create unused abstractions or microservices.

## Working approach

1. Inspect the live repository and relevant specification sections before editing.
2. Preserve existing user changes and established behavior unrelated to the request.
3. Resolve the root cause and implement the smallest complete vertical slice.
4. Add or update tests for changed business-critical behavior and regressions.
5. Run focused checks first, then broader checks proportional to the change.
6. Continue through implementation and verification while safe in-scope work remains.
7. Report changed files, observed verification results, assumptions, and remaining limitations.

Use a safe, reversible default when an ambiguity does not change product meaning. Ask for a decision when it materially affects legal or tax rules, money, inventory integrity, destructive data changes, production credentials, or customer communications.

## Verification

Use the scripts actually defined by `package.json`. Expected quality gates, once initialized, are equivalent to:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Run relevant Playwright tests for changed customer or administrator journeys. Never claim a check passed unless its output was observed. Do not fix unrelated failures without clearly reporting them.

## External actions

Local tests use disposable data and may be run without additional approval. Do not commit, push, deploy, rotate credentials, send real notifications, import production data, or mutate external services unless the user explicitly requests that action.

## Completion standard

A change is complete when its requested behavior works, relevant failure and authorization paths are handled, tests and checks have been observed, migrations are safe, changed UI is responsive and accessible, and documentation/configuration is updated where needed. See Section 22 of the specification for the full definition of done.
