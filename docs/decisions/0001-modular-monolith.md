# ADR 0001: Start with a TypeScript modular monolith

- Status: Accepted
- Date: 2026-11-02

## Context

The product needs a storefront, administration, order processing, inventory, COD reconciliation,
and provider integrations. These workflows share transactions and invariants, while initial scale and
team boundaries do not justify distributed services.

## Decision

Use one Next.js application and one PostgreSQL database. Organize business capabilities as explicit
modules with UI, application service, domain, repository, and adapter boundaries where those layers
are needed. External providers remain behind narrow interfaces. Background side effects use a
transactional outbox.

## Consequences

- Cross-domain transactions remain reliable and observable.
- Development and deployment stay simple during product discovery.
- Module boundaries must be enforced in code review to avoid a tightly coupled monolith.
- A module may be extracted later only after measured scaling, isolation, or ownership needs justify
  the operational cost.
