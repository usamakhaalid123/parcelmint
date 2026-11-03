# Staff access operations

Supabase Auth owns credentials and verified sessions. Application tables own staff status, roles,
permissions, and audit history. A valid Supabase login does not grant administrative access by
itself.

## Bootstrap the first owner

1. Create the owner identity through the Supabase dashboard or an approved identity workflow.
2. Set the database, Supabase URL, public client key, and service-role key in `.env.local`. Never
   paste these values into logs, issues, or chat.
3. Apply migrations and seed authorization reference data.
4. Run the owner bootstrap using the immutable Supabase user UUID:

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm db:provision-owner \
  --identity-id 00000000-0000-0000-0000-000000000000 \
  --reason "Initial production owner approved by NAME/TICKET"
```

The command verifies that the identity exists through the server-only Supabase admin client, grants
the system `owner` role transactionally, and writes an immutable audit record. Do not use it as a
general staff-management command.

## Ongoing access management

- Role mutations must call the server-side role service and require `staff.manage`.
- Every allowed, denied, or failed role assignment writes an audit event.
- Suspend application access immediately when staff access is revoked; disable the Supabase identity
  when credential access must also stop.
- Never assign permissions from client code or editable Supabase user metadata.
- Review owner and administrator grants periodically.

## Multi-factor authentication

Administrative MFA is a mandatory production-launch control. Configure and test Supabase MFA before
production approval, including enrollment, recovery, support, and locked-out-staff procedures. Do not
claim production readiness while staff can authenticate with only one factor.

## Incident recovery

If the only owner is locked out, use the documented break-glass identity process and rerun owner
bootstrap with a new correlation reason. Preserve prior users, role assignments, and audit records;
do not delete or rewrite history.
