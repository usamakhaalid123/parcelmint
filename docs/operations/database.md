# Database development and migration operations

Phase 1 uses PostgreSQL through Drizzle. Supabase is the initial managed provider, but migrations are
kept compatible with a standard PostgreSQL database.

## Connections

- `DATABASE_URL` is the pooled runtime connection.
- `DIRECT_DATABASE_URL` is the direct connection used by migrations. It falls back to
  `DATABASE_URL` for local development only.
- Never place either value in a browser-visible variable or commit a populated environment file.

## Migration workflow

After changing `src/db/schema`, generate and review a forward migration:

```bash
corepack pnpm db:generate
```

Apply reviewed migrations to an empty disposable database first:

```bash
DIRECT_DATABASE_URL=postgresql://... corepack pnpm db:migrate
```

Do not edit migrations already applied to a shared environment. Roll application code back without
reversing a migration unless a separately reviewed corrective migration is required.

## Reference data

Run the idempotent seed after migrations:

```bash
DATABASE_URL=postgresql://... corepack pnpm db:seed
```

The seed synchronizes only system roles, permissions, and their grants. It does not create staff,
customers, orders, or production credentials. The first owner must be provisioned through a
separately audited operational procedure after Supabase identity setup.

Follow [`staff-access.md`](staff-access.md) for the verified first-owner bootstrap command and access
review requirements.

## Data safety

- Use disposable databases for automated integration tests.
- Never run seeds or tests against production.
- Audit and outbox payloads must contain identifiers and operational facts, not copied secrets or
  unnecessary personal data.
- Migration access should use separate release credentials with only the privileges required for
  schema changes.
