# COD verification and fulfillment operations

Phase 5 keeps verification, fulfillment, shipment, delivery attempts, and order lifecycle as
separate concerns. Staff operations require server-side permissions and write both an operational
event and an audit record. Do not update order state columns directly.

## Verification

New orders begin with `pending` verification. Staff with `orders.manage` may manually confirm or
reject them. Confirmation creates the order's fulfillment and shipment records and extends active
inventory reservations. Rejection releases active reservations and cancels the order.

The provider-neutral OTP service stores only a salted scrypt verifier. Codes expire after ten
minutes, failed attempts are persisted, and a challenge locks after five failures. The returned
one-time code is intended only for the notification adapter; never log it, persist it as plaintext,
or place it in an outbox payload.

Likely duplicate orders create internal risk flags but are not automatically rejected. Mobile and
address blocks are stored as one-way hashes and managed under `customers.blocklist`; additions and
removals require reasons and are audited. Delivery-zone COD minimums, maximums, and enablement are
rechecked inside the checkout transaction.

## Fulfillment and stock

The permitted fulfillment path is:

```text
unfulfilled -> processing -> packed -> fulfilled
```

Cancellation is allowed before handoff and releases reservations. Courier handoff atomically:

- changes fulfillment to `fulfilled`;
- changes the shipment to `handed_to_courier`;
- decrements on-hand and reserved quantities;
- consumes each reservation;
- writes immutable inventory movements and audit events; and
- enqueues the shipped notification after commit.

Post-handoff cancellation requires `orders.cancel_after_shipment` and does not restore inventory.
Physical return receipt and sellable disposition belong to the returns phase.

## Shipments and delivery attempts

Shipment transitions are enforced by the domain state policy. Provider event identifiers are unique,
so duplicate webhook delivery is ignored; state regressions and skipped transitions are rejected.
Delivery attempts are append-only events with an attempt number, outcome, reason, and timestamp.

Courier adapters submit normalized events to `POST /api/v1/integrations/courier/events` with
`Authorization: Bearer <COURIER_WEBHOOK_SECRET>`. The secret must contain at least 32 random
characters. Payloads identify the courier and tracking number, include a unique provider event ID,
and map into an allowed internal shipment state; do not expose raw provider payloads or credentials
in logs.

Packing slips and invoices are generated from immutable order snapshots under the protected order
administration routes. They intentionally do not read mutable catalog prices or names.

## Notifications

Order transactions enqueue identifier-only outbox events. The notification handler loads the contact
destination after claiming the event, uses versioned template keys with an allowlisted order-number
variable, and records every provider attempt. Provider failure leaves the order committed and moves
the outbox event through bounded retry/dead-letter handling.

The repository ships with an unavailable notification sender. Configure a reviewed provider adapter
before enabling the scheduled outbox invocation in a shared environment; otherwise notification
events deliberately retry and eventually become dead-letter work rather than pretending to send.

## Monitoring

Alert on old pending verifications, reservations approaching expiry, orders stuck in processing or
packed, repeated delivery failures, notification dead letters, and shipment provider-event rejection.
Never include customer names, phone numbers, addresses, OTPs, or internal fraud notes in logs or
outbox payloads.
