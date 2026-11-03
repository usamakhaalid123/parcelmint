# Catalog and inventory operations

Phase 2 stores catalog data in PostgreSQL and product image objects in a private Supabase Storage
bucket. Administrative mutations are authorized on the server and inventory changes always write an
immutable movement and audit record.

## Apply the Phase 2 migrations

Apply migrations before opening the catalog administration routes:

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
```

The seed remains idempotent and keeps the existing `catalog.manage` and `inventory.adjust`
permissions assigned to the approved system roles.

## Configure product image storage

In the Supabase development project:

1. Open **Storage** and create a bucket matching `STORAGE_BUCKET_PRODUCTS` (the documented local
   value is `product-images`).
2. Keep the bucket private. Public storefront delivery will use a reviewed storage adapter in the
   storefront phase rather than making administrative uploads public by default.
3. Restrict accepted MIME types to JPEG, PNG, and WebP and set the bucket file-size limit to 5 MB.

The application also validates declared MIME type, file size, and file signature before uploading.
Object names are generated UUID paths and never include the supplied filename.

## Inventory adjustments

- Enter positive deltas to add units and negative deltas to remove units.
- Every adjustment requires an operational reason.
- The service locks the inventory row, prevents negative on-hand stock or stock below active
  reservations, increments its concurrency version, and inserts an immutable movement in the same
  transaction.
- Never correct stock by editing `inventory_items` or `inventory_movements` in the Supabase table
  editor.

## CSV import and export

Download an export from `/admin/catalog` to obtain the supported header and a reusable template.
Imports are limited to 2 MB, validate the complete file, reject duplicate normalized SKUs or slugs,
and use one database transaction. No rows are committed when any row fails.

CSV files contain operational inventory quantities. Treat exports as confidential business data and
do not commit them to the repository.
