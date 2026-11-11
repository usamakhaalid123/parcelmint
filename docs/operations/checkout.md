# Cart and checkout operations

Phase 4 provides opaque-cookie guest carts, server-authoritative pricing, delivery zones, coupons,
idempotent order creation, and expiring inventory reservations. Guest purchase never requires an
account.

## Required configuration

Checkout remains unavailable until at least one active `delivery_zones` row and compatible active
`shipping_rates` row exist. Configure these records through a reviewed migration or controlled
operator script using approved business areas, fees, currency, and delivery estimates. Do not seed a
fictional production delivery promise.

Coupon values are integer minor units for fixed discounts and basis points for percentage discounts
(`1000` means 10%). Codes are normalized to uppercase. Date, currency, subtotal, total usage, and
per-customer limits are checked again inside the order transaction.

## Order transaction

Checkout locks the cart inventory rows in stable order, then recalculates catalog prices, coupon
eligibility, delivery, and stock. In one database transaction it writes immutable order item/address
snapshots, increments reserved inventory, writes the idempotency response, converts the cart, and
enqueues `order.received` in the outbox. The outbox payload contains identifiers only, not customer
contact or address data.

The browser submits a UUID idempotency key. Repeating the same normalized payload returns the first
order. Reusing the key with different details is rejected. Never retry a rejected conflict with a
different payload under the same key.

## Reservation expiry

Invoke the overlap-safe expiry worker on a schedule:

```http
POST /api/v1/jobs/reservations
Authorization: Bearer <WORKER_INVOCATION_SECRET>
```

The worker claims up to 100 expired active reservations with `FOR UPDATE SKIP LOCKED`, only for
orders still pending verification. It releases reserved quantities, expires the order verification
state after its final reservation is released, and emits one idempotent `order.reservation_expired`
outbox event. Monitor failures and reservation age. The worker secret must contain at least 32 random
characters and must never appear in a URL or logs.

## Privacy and retention

Cart cookies contain a random 256-bit token; only its SHA-256 digest is stored. Checkout rate-limit
subjects and coupon customer limits also store one-way hashes. Orders necessarily contain delivery
contact data, which must not be copied into logs, analytics, outbox payloads, or public caches.
Define order/contact retention and anonymization policy before production launch.
