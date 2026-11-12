# COD reconciliation and operational reporting

Phase 7 keeps order submission, delivery, courier cash collection, remittance, and reconciliation as separate operational facts.

## Cash lifecycle

```text
not_due -> collection_due -> collected_by_courier -> remittance_pending -> reconciled
                         \-> collection_failed -> collected_by_courier
                                               \-> written_off
remittance_pending -> disputed -> reconciled|written_off
```

- Checkout creates one `cod_collections` record using the server-authoritative order total and currency.
- Delivery changes only `not_due` to `collection_due`; delivery never implies collection.
- Recording collection requires the amount, collection time, courier reference, reason, and a staff member with `cash.reconcile`.
- Remittance records require a courier batch reference before reconciliation.
- A mismatched remittance opens a discrepancy. An authorized accountant may accept the documented actual amount or write off the discrepancy with a reason.
- Failed collection and write-off are explicit, audited outcomes.
- Cash events and reconciliation records are append-only database history.

## Operational values

The reporting screen and CSV keep these measures separate:

- **Submitted order value:** the order grand total at submission.
- **Delivered merchandise value:** delivered subtotal less discount plus tax; shipping is excluded.
- **Cash collected:** the amount the courier reports collecting.
- **Cash reconciled:** the amount accepted through reconciliation.

These are operational measures, not accounting revenue. Every CSV row includes its order number, cash state, courier reference, remittance batch, and discrepancy amount so totals can be traced to orders.

## Access and exports

- `/admin/cash` requires `cash.reconcile`.
- `/admin/reports` and `/api/v1/admin/reports/cod.csv` require `reports.read`.
- CSV responses are private, non-cacheable, and can be filtered with inclusive UTC `from` and `to` query parameters in `YYYY-MM-DD` format.
