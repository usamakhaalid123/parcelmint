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

Administrative previews are served through an authenticated, non-cacheable application endpoint.
Do not copy a storage key into the local application URL or make the bucket public. Image ordering,
primary selection, and deletion are available on the product administration page and require an
audit reason. The first image is made primary automatically; later uploads can explicitly replace
the primary image.

## Brands and categories

Use `/admin/catalog/organization` to create brands and hierarchical categories or archive and
restore them. Slugs are stable identifiers and must be unique. Archiving preserves product and
historical references; do not delete referenced organization records directly in Supabase.

## Inventory adjustments

- Enter positive deltas to add units and negative deltas to remove units.
- Every adjustment requires an operational reason.
- The service locks the inventory row, prevents negative on-hand stock or stock below active
  reservations, increments its concurrency version, and inserts an immutable movement in the same
  transaction.
- Never correct stock by editing `inventory_items` or `inventory_movements` in the Supabase table
  editor.

## Variant maintenance

Use the variant editor on the product administration page to change SKU, title, price override,
shipping measurements, active state, stock behavior, or low-stock threshold. Updates require an
audit reason and use an optimistic version check. If another operator has changed the variant,
refresh the page before retrying instead of overwriting their update.

## CSV import and export

Download an export from `/admin/catalog` to obtain the supported header and a reusable template.
Imports are limited to 2 MB, validate the complete file, reject duplicate normalized SKUs or slugs,
and use one database transaction. No rows are committed when any row fails.

CSV files contain operational inventory quantities. Treat exports as confidential business data and
do not commit them to the repository.

## Phase 2 verification

Database integration tests truncate their target before each suite run. `TEST_DATABASE_URL` must
therefore point only to a disposable database whose name ends in `_test`:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/parcelmint_test \
  corepack pnpm test:integration
```

Browser tests start the application on port 3100 by default so they cannot silently reuse an
unrelated service on the normal development port. Override this with `E2E_PORT` when necessary.
