# Public storefront operations

Phase 3 publishes only products in the `active` lifecycle state and only active variants. Draft and
archived products return the public not-found response even when their slug is known.

## Discovery and availability

- `/products` supports validated search, category, brand, price, availability, sorting, and page
  parameters.
- Product availability is derived from active variant inventory. Untracked active variants are
  treated as available; tracked variants require on-hand quantity minus reserved quantity above
  zero.
- Public product pages use stable slugs. Product and image identifiers are not accepted as authority
  to expose draft or archived data.
- Public product images remain in the private product bucket and are served by the application only
  when their product is active.

Catalog reads use a five-minute server cache tagged `storefront-catalog`. Successful administrative
catalog, organization, image, and inventory mutations invalidate that tag.

## Search indexing

The root page, unfiltered catalog, product pages, and reviewed content pages are indexable. Filtered
catalog combinations and all administrative routes are marked `noindex`. `robots.txt` excludes
administrative, authentication, and API routes; the dynamic sitemap lists active product slugs.

Content pages that depend on business or legal approval explicitly remain pre-launch notices. They
must be replaced with approved policies before completing the launch checklist.

## Browser verification

The browser CI job uses a disposable PostgreSQL database whose name ends in `_test`. Playwright
creates synthetic active products only when `E2E_DATABASE_URL` is explicitly present; it never seeds
the configured development database by default.
