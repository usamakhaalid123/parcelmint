# ADR 0003: Separate Supabase identity from application authorization

- Status: Accepted
- Date: 2026-11-02

## Context

Supabase Auth owns credentials and session verification, while the commerce application needs
default-deny roles, permissions, staff suspension, and auditable sensitive actions. Coupling business
authorization to provider metadata would make policies difficult to constrain, query, and migrate.

## Decision

Use the immutable Supabase identity UUID as an external identity reference in the application
`users` table. Verify server identities with Supabase `getClaims()`, then resolve account status,
roles, and permissions from PostgreSQL through Drizzle. Never authorize from client navigation,
unverified cookie contents, or editable user metadata.

The initial schema intentionally avoids a foreign key to Supabase's managed `auth.users` table. This
keeps migrations runnable against an empty standard PostgreSQL database and keeps the identity
provider replaceable. Application provisioning must enforce the one-to-one identity mapping.

## Consequences

- Guest checkout remains independent of account creation.
- Staff authorization defaults to deny and remains server-enforced.
- A verified provider session alone does not grant administrative access.
- Identity provisioning and deprovisioning require explicit application workflows and audit events.
