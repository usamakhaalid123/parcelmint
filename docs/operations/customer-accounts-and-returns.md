# Customer accounts, tracking, and returns

Phase 6 separates authenticated customer ownership from guest order access.

## Customer accounts

- Supabase Auth owns customer credentials and sessions.
- Application `users` and `customer_profiles` records own business identity and authorization.
- Orders placed while signed in snapshot the customer ID. Guest checkout remains available.
- Saved-address mutations always include the authenticated customer ID in their database predicate.
- Historical `order_addresses` remain immutable and are never replaced by saved-address edits.

## Guest tracking

- `/track` accepts an order number and mobile number but gives the same initial response whether or
  not an order matches.
- Six-digit verifiers are salted, hashed, expire after ten minutes, and lock after five failures.
- Successful verification creates a random, hashed, order-scoped session that expires after thirty
  minutes. The browser receives only the opaque session token in an HTTP-only cookie.
- Development displays the generated code for disposable testing. Production must connect the
  tracking challenge service to the approved SMS provider before launch; codes must never be logged.

## Cancellation

Customer cancellation is allowed only while the order is active, before inventory finalization and
courier handoff. Cancellation releases active reservations transactionally and records an order
event, audit record, and notification outbox event.

## Returns

The return state machine is:

```text
requested -> approved -> in_transit -> received -> inspected -> resolved
requested -> rejected
requested|approved -> cancelled
```

- Requests are accepted only for delivered orders inside the configured fourteen-day window.
- Cumulative active return quantities cannot exceed the immutable ordered quantity.
- Approval, receipt, inspection, resolution, and refund recording are separate staff operations.
- Inspection explicitly records the sellable quantity. Resolution restores only those units and
  creates an immutable inventory movement.
- Offline refunds record method, amount, currency, external reference, staff actor, and optional
  recipient confirmation. They do not rewrite the original order totals.
