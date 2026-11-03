# ADR 0002: Validate deployment configuration at trust boundaries

- Status: Accepted
- Date: 2026-11-02

## Context

Local development must start without production credentials, while staging and production must fail
clearly when required public configuration is missing. Secret values must never reach the browser or
error output.

## Decision

Use a small Zod-backed server configuration module. `DEPLOYMENT_ENV` distinguishes local, staging,
and production behavior. Only intentionally public values may use the `NEXT_PUBLIC_` prefix. Provider
configuration will be added to the schema in the phase that introduces each provider.

## Consequences

- Local development has safe defaults.
- Staging and production reject incomplete configuration.
- Future phases must extend validation together with `.env.example` and tests.
