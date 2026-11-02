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

## Repository guidance

Read `AGENTS.md` before changing the application. It routes work to the relevant sections of the
project specification and records the non-negotiable product invariants.

## Pending business decisions

The store identity, selling regions, currency, taxes, delivery rules, courier, COD limits,
verification method, customer policies, launch languages, and expected volume remain configurable
until the owner confirms them. Do not substitute invented production values.
