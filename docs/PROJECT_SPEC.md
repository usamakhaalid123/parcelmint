# Cash-on-Delivery E-commerce Platform Specification

This document is the canonical product, architecture, operations, and delivery specification. Read only the sections relevant to the current task, as directed by `../AGENTS.md`. When implementation and this document disagree, identify whether the specification is outdated or the implementation violates an invariant; preserve established production behavior until the conflict is resolved.

## 1. Product objective

Build a secure, responsive e-commerce web application where:

- Store staff can manage products, variants, categories, inventory, customers, orders, deliveries, returns, promotions, and cash reconciliation.
- Customers can discover products, add products to a cart, place cash-on-delivery (COD) orders, receive confirmation, and track delivery.
- The business can reduce fake COD orders, prevent overselling, track delivery failures, and distinguish submitted order value, delivered merchandise value, collected cash, and reconciled cash.
- The application can be deployed as a production service with monitoring, backups, CI/CD, and documented operational procedures.

The first release is a responsive web application, not a native mobile application.

## 2. Product principles

1. Mobile-first: design for mobile customers before enhancing desktop layouts.
2. Simple checkout: support guest checkout and do not require account creation to buy.
3. Server authority: the server owns prices, discounts, shipping fees, inventory, permissions, and status transitions.
4. COD is an operational workflow: verification, fulfillment, delivery attempts, cash collection, and reconciliation are separate states.
5. Preserve history: completed orders retain their original commercial data even when products later change.
6. Secure by default: least privilege, explicit authorization, validation at trust boundaries, and auditable administrative actions.
7. Accessible and fast: target WCAG 2.2 AA and good Core Web Vitals.
8. Build a modular monolith first. Do not introduce microservices without measured operational need.

## 3. Assumptions requiring confirmation

Before production launch, the owner must confirm:

- Store name, logo, visual identity, domain, and support contact details.
- Selling country or countries, currency, locale, and timezone.
- Tax and invoice rules.
- Delivery areas, fees, free-shipping thresholds, and expected delivery times.
- Maximum COD amount and any products or areas excluded from COD.
- Courier providers and whether API integration is available.
- Order verification method: call, SMS OTP, WhatsApp, email, or a combination.
- Return, exchange, cancellation, privacy, shipping, and retention policies.
- Languages required at launch.
- Initial product volume, expected monthly orders, and expected staff count.

Until confirmed, implement these values as configuration rather than hard-coded business rules. Do not invent legal, tax, or courier requirements.

## 4. Release scope

### 4.1 MVP requirements

The minimum production release includes:

- Responsive storefront and administration dashboard.
- Product catalog, categories, brands, variants, images, search, filters, sorting, and pagination.
- Product detail pages with price, availability, variants, delivery information, and related products.
- Persistent cart.
- Guest COD checkout.
- Optional customer accounts, saved addresses, order history, and reordering.
- Guest order lookup using order number plus verified phone access.
- Product, variant, and inventory management.
- Order verification, fulfillment, shipping, delivery, cancellation, return, and COD reconciliation workflows.
- Delivery zones and shipping-fee calculation.
- Coupon support for fixed or percentage discounts with explicit eligibility rules.
- Email notifications and a provider abstraction for SMS or WhatsApp.
- Invoices, packing slips, CSV product import/export, and CSV order export.
- Staff roles, permissions, audit logs, private order notes, and status history.
- Basic business reports.
- SEO foundations, analytics, error monitoring, backups, and deployment automation.
- About, Contact, FAQ, Shipping, Returns, Privacy, and Terms pages.

### 4.2 Deferred features

Do not add these to the MVP unless explicitly approved:

- Online card or wallet payments.
- Native mobile applications.
- Loyalty points or referral programs.
- Marketplace or multi-vendor functionality.
- Multiple warehouses.
- Supplier and purchase-order management.
- Advanced recommendation engines.
- Live chat.
- Complex accounting or ERP integration.
- Full multilingual content management.
- Microservices, Kubernetes, event streaming, or a dedicated search cluster.

Design clear extension points for courier, notification, payment, tax, and storage providers, but do not build unused abstractions.

## 5. Technology standards

### 5.1 Languages

- Frontend application: TypeScript, React, semantic HTML, and CSS through Tailwind CSS.
- Backend application: TypeScript running on Node.js through Next.js server features.
- Database: PostgreSQL and SQL migrations.
- Configuration and automation: JSON, YAML, shell scripts only where appropriate, and infrastructure configuration supported by the chosen host.
- Documentation: Markdown.

Do not add a second backend language without an approved architectural reason. Use TypeScript strict mode and do not use `any` to bypass typing.

### 5.2 Core stack

- Framework: current stable Next.js with the App Router.
- UI: current stable React, Tailwind CSS, and accessible headless components where useful.
- Runtime: current active LTS Node.js supported by the chosen Next.js version.
- Package manager: pnpm with a committed lockfile.
- Database: managed PostgreSQL, initially Supabase Postgres.
- Database access and migrations: Drizzle ORM and Drizzle Kit, with explicit SQL where it materially improves correctness or performance.
- Authentication: Supabase Auth with server-side session handling.
- Object storage: Supabase Storage initially, behind a small storage service boundary.
- Validation: Zod schemas shared at appropriate boundaries.
- Forms: native server actions for simple mutations; React Hook Form for complex client-side form behavior.
- Transactional email: provider adapter, initially Resend or Amazon SES after owner selection.
- SMS/WhatsApp: provider adapter selected for the launch country.
- Background work: a PostgreSQL transactional outbox plus an idempotent scheduled worker; introduce a dedicated queue only when measured volume or latency requires it.
- Monitoring: Sentry or an approved equivalent.
- Product analytics: privacy-conscious analytics selected before launch.
- Unit and integration tests: Vitest and React Testing Library.
- Browser tests: Playwright.
- Code quality: ESLint, Prettier, TypeScript compiler, and dependency/security scanning.
- Hosting: Vercel initially; keep business logic portable to a standard Node.js or Docker deployment.

Use current stable compatible versions when the repository is initialized, then pin them through the lockfile. Do not perform unrelated major dependency upgrades during feature work.

## 6. Architecture

Use a modular monolith with one deployable Next.js application and one PostgreSQL database.

```text
Browser
  -> Next.js storefront/admin
      -> application services
          -> domain rules
              -> repositories/adapters
                  -> PostgreSQL
                  -> transactional outbox -> background worker
                  -> object storage
                  -> email/SMS/WhatsApp
                  -> courier provider
```

### 6.1 Architectural boundaries

- UI components render data and collect intent. They do not own business rules.
- Route handlers and server actions authenticate, authorize, validate, and call application services.
- Application services coordinate use cases and database transactions.
- Domain modules own invariants and allowed state transitions.
- Repositories own persistence details.
- Provider adapters isolate storage, courier, email, SMS, and WhatsApp SDKs.
- Transactional code records external side effects in the outbox; workers perform those effects only after commit.
- Cross-module access should occur through a module's exported service contract, not by reaching into internal files.

Never call the database directly from client components. Never expose service-role credentials to the browser.

### 6.2 Rendering approach

- Use Server Components by default.
- Add `"use client"` only for components requiring browser state, event handlers, or browser-only APIs.
- Use server rendering or static generation for public catalog and policy pages when appropriate.
- Use cache tags and targeted revalidation for catalog changes.
- Do not cache personalized carts, accounts, admin data, or order details publicly.
- Keep URL search parameters as the source of truth for shareable search, filters, sorting, and pagination.

### 6.3 API approach

- Prefer server actions for same-application form mutations.
- Use REST-style route handlers under `/api/v1` for public integrations, webhooks, exports, and operations consumed outside the React tree.
- Return a consistent result shape with machine-readable error codes.
- Version externally consumed APIs.
- Make order creation and webhook processing idempotent.
- Authenticate courier/provider webhooks and retain a minimal event receipt for replay protection and debugging.
- Reject reuse of an idempotency key with a different normalized request payload.
- Never trust totals, discounts, stock values, roles, or status values supplied by a client.

## 7. Repository structure

Use this structure unless an approved decision replaces it:

```text
.
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── drizzle.config.ts
├── public/
│   └── images/
├── src/
│   ├── app/
│   │   ├── (storefront)/
│   │   │   ├── page.tsx
│   │   │   ├── products/
│   │   │   ├── categories/
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   ├── orders/
│   │   │   └── account/
│   │   ├── admin/
│   │   ├── api/v1/
│   │   ├── layout.tsx
│   │   ├── error.tsx
│   │   ├── not-found.tsx
│   │   └── globals.css
│   ├── modules/
│   │   ├── auth/
│   │   ├── catalog/
│   │   ├── cart/
│   │   ├── checkout/
│   │   ├── customers/
│   │   ├── inventory/
│   │   ├── orders/
│   │   ├── promotions/
│   │   ├── shipping/
│   │   ├── returns/
│   │   ├── reconciliation/
│   │   ├── notifications/
│   │   ├── jobs/
│   │   └── reporting/
│   ├── components/
│   │   ├── ui/
│   │   └── shared/
│   ├── db/
│   │   ├── schema/
│   │   ├── migrations/
│   │   ├── client.ts
│   │   └── seed.ts
│   ├── lib/
│   ├── config/
│   ├── styles/
│   └── types/
├── tests/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   └── helpers/
└── docs/
    ├── architecture/
    ├── operations/
    └── decisions/
```

Each domain module should normally contain only the layers it needs:

```text
module-name/
├── components/
├── schemas/
├── server/
│   ├── actions.ts
│   ├── repository.ts
│   └── service.ts
├── domain/
│   ├── errors.ts
│   ├── policies.ts
│   └── types.ts
└── index.ts
```

Avoid generic `utils.ts` dumping grounds. Name files after their responsibility.

## 8. Coding standards

### 8.1 TypeScript and React

- Enable `strict`, `noUncheckedIndexedAccess`, and other safe compiler options compatible with the stack.
- Prefer type inference within a function and explicit types at module boundaries.
- Use discriminated unions for statuses and results.
- Use immutable data unless mutation is deliberately local.
- Prefer small, composable functions and components.
- Components use PascalCase; functions and variables use camelCase; constants use descriptive names.
- Database columns use snake_case; translate to application naming consistently through the data layer.
- Avoid default exports except where Next.js file conventions require them.
- Do not suppress TypeScript, ESLint, or accessibility errors without a documented reason.
- Do not store server-derived data in client state merely to mirror props.
- Use error boundaries, loading states, empty states, and retry actions where appropriate.

### 8.2 Backend and domain logic

- Validate all external input with Zod at the boundary.
- Authorize every administrative operation on the server.
- Use database transactions for order creation, inventory reservation/release, returns, and reconciliation.
- Represent money as integer minor units, never binary floating-point values.
- Pair every persisted monetary amount with an ISO 4217 currency code. Define currency-specific decimal and rounding behavior centrally; do not assume every currency has two decimal places.
- Store timestamps in UTC and format them in the configured business timezone.
- Store international phone numbers in normalized E.164 form when possible.
- Generate human-friendly order numbers separately from internal UUID primary keys.
- Use idempotency keys for checkout submission and integration events.
- Use a transactional outbox for post-commit notifications and provider calls. Workers must be safe to retry and must use bounded retry/dead-letter handling.
- Use structured logging with request or correlation IDs. Redact secrets and unnecessary personal data.
- Domain errors should map to safe user messages; never expose stack traces or raw database errors.

### 8.3 Database standards

- Every schema change requires a forward migration committed to the repository.
- Do not edit a migration already applied to a shared environment; create a new migration.
- Add foreign keys, uniqueness constraints, check constraints, and indexes that enforce known invariants.
- Enforce unique normalized SKUs and the intended slug scope in the database.
- Use UUIDs for internal identifiers unless measurement proves another strategy is necessary.
- Use soft deletion or archival for business records referenced by historical orders.
- Include `created_at` and `updated_at` where appropriate.
- Use optimistic concurrency or row locking for race-sensitive inventory updates.
- Review query plans for catalog search, order lists, and reports before launch.
- Keep production seed operations idempotent and never seed fake customers or orders in production.

### 8.4 CSS and design system

- Define color, typography, spacing, radius, shadow, and motion tokens centrally.
- Use semantic tokens such as `background`, `surface`, `foreground`, `primary`, `danger`, and `success`.
- Do not scatter arbitrary hex colors and pixel values throughout components.
- Build reusable primitives for buttons, inputs, selects, dialogs, tables, pagination, alerts, badges, and skeletons.
- Meet accessible contrast, focus, keyboard, label, and error-message requirements.
- Respect `prefers-reduced-motion`.
- Product images must reserve aspect ratio to avoid layout shift.

## 9. Functional requirements

### 9.1 Storefront pages

- Home: merchandising sections, featured categories, featured products, promotions, trust information, and search entry.
- Catalog: query-based search, category/brand/price/availability/variant filters, sorting, and pagination.
- Product: gallery, title, description, SKU, price, optional compare-at price, variant selection, availability, delivery estimate, return eligibility, and related products.
- Cart: quantity editing, item removal, stock validation, coupon entry, subtotal, discount, delivery estimate, and total.
- Checkout: contact information, delivery address, delivery option, instructions, policy agreement, order summary, and COD disclosure.
- Confirmation: non-sensitive order summary, next steps, verification status, and tracking instructions.
- Tracking: authenticated account access or order number plus a short-lived phone OTP. Do not reveal whether an order exists before the verification challenge succeeds.
- Account: profile, saved addresses, order history, eligible cancellation/return actions, and reorder.
- Content: About, Contact, FAQ, Shipping, Returns, Privacy, and Terms.

### 9.2 Catalog and inventory

- Product lifecycle is `draft`, `active`, or `archived`. Availability such as in stock, low stock, out of stock, or backorder is derived separately from variant inventory and policy.
- Variants can define SKU, price override, attributes, weight, dimensions, and stock behavior.
- Images support alt text, deterministic ordering, and one primary image.
- Categories support hierarchy and stable slugs.
- Inventory changes create immutable inventory-movement records with reason, quantity delta, actor, and reference.
- Available quantity is derived from on-hand quantity minus active reservations; do not maintain independently drifting totals.
- Low-stock thresholds are configurable per variant or globally.
- CSV imports validate the entire row set and provide an error report. They must not silently partially import invalid data.

### 9.3 Cart and pricing

- Anonymous carts use a secure opaque identifier; authenticated carts belong to a customer.
- Cart merge behavior on login must be deterministic and tested.
- Recalculate every price, promotion, stock level, and delivery fee at checkout.
- Store product prices and calculated totals in integer minor units.
- Snapshot the order currency and the rounding policy used for every calculated total.
- Coupon rules may include active dates, usage limit, per-customer limit, minimum subtotal, eligible products/categories, and maximum discount.
- The order stores subtotal, discount, shipping, tax if applicable, and grand total independently.

### 9.4 Checkout and order creation

- Guest checkout is mandatory for MVP.
- Required fields: customer name, mobile number, delivery area, complete address, and policy consent.
- Optional/configurable fields: email, postal code, landmark, and delivery instructions.
- Reject unsupported delivery areas and unavailable items before order creation.
- A repeated submission with the same idempotency key and normalized payload returns the original result; reuse with a different payload is rejected.
- Order creation and stock reservation occur atomically.
- The order transaction writes a notification event to the transactional outbox; a worker sends it only after commit.

### 9.5 COD verification and fraud controls

- New orders start as `pending_verification` unless an approved policy permits automatic confirmation.
- Support manual confirmation and a provider-neutral OTP workflow.
- Record verification method, result, actor, and timestamp.
- Store OTPs as short-lived one-way verifiers, never plaintext; limit attempts and invalidate them after success or expiry.
- Apply rate limits to checkout and OTP endpoints.
- Detect likely duplicate orders using configurable signals without automatically blocking legitimate family/shared-number orders.
- Support a customer/address blocklist with reason, expiry, and auditable override.
- Support configurable COD amount and delivery-zone restrictions.
- Never expose internal fraud notes to customers.

### 9.6 Administration dashboard

- Dashboard cards: orders today, delivered merchandise value, pending verification, pending fulfillment, low stock, failed deliveries, returns, and cash awaiting reconciliation.
- Product management: create, edit, duplicate, activate, archive, manage variants/images/SEO, and import/export.
- Order management: search/filter, inspect, verify, cancel, pack, ship, record attempts, mark delivery, process returns, print documents, assign tracking, and add private notes.
- Customer management: view contact/address/order history, apply or remove operational flags with reasons, and honor data requests.
- Settings: store identity, currency, timezone, delivery zones, fees, COD policies, notification templates, and staff roles.
- Reports: orders and delivered merchandise value by date, status, product, category, city/zone, courier, return reason, and refusal reason.
- Operational reports must clearly distinguish submitted order value, delivered merchandise value, cash collected, and cash reconciled. Do not label an operational metric as accounting revenue unless the owner's accounting policy defines it that way.

## 10. Order, verification, fulfillment, shipment, return, and cash state models

Do not store one overloaded order status as the source of truth. Verification, fulfillment, shipment, return, and COD cash each have an independent state machine. A customer-facing label such as “Out for delivery” is a derived projection of those states.

Every transition must be enforced by a domain policy and recorded with previous state, new state, actor or provider, reason, and timestamp. UI controls derive from permitted server-side transitions; they do not define them.

### 10.1 Order lifecycle and verification

The order lifecycle is intentionally small:

```text
active -> closed
active -> cancelled
```

Close an order only after fulfillment, return eligibility, and COD reconciliation no longer require operational action. Cancellation requires a reason and must not erase the order.

Verification state:

```text
pending -> confirmed
pending -> rejected
pending -> expired
```

Only confirmed orders may enter fulfillment. Reverification or an override requires an explicit audited action rather than silently reversing a terminal verification result.

### 10.2 Fulfillment and inventory reservation

Fulfillment state:

```text
unfulfilled -> processing -> packed -> fulfilled
unfulfilled|processing|packed -> cancelled
```

- Reserve inventory atomically when the order is submitted and record `expires_at` on each reservation.
- A scheduled, idempotent worker releases expired reservations only while verification remains pending. Confirmation clears or extends the expiry according to policy.
- Cancellation before stock finalization releases the reservation.
- At handoff to the courier, atomically mark fulfillment `fulfilled`, decrement on-hand stock, and consume the reservation.
- Cancellation or return after courier handoff does not automatically restore stock. Physical receipt and inspection create a separate inventory movement.
- Returned units become available only after an explicit sellable disposition.
- Inventory cannot become negative unless an approved backorder policy is introduced.

### 10.3 Shipment status

Shipment state is separate from fulfillment and order lifecycle:

```text
pending -> label_created -> handed_to_courier -> in_transit
-> out_for_delivery -> delivered
```

Exception states include `attempt_failed`, `return_to_origin`, `returned_to_sender`, `lost`, `damaged`, and `cancelled`. Record delivery attempts as events rather than repeatedly toggling a shipment between two states. Courier updates must be authenticated, idempotent, order-aware, and mapped into internal statuses without accepting invalid regressions.

The MVP may restrict an order to one fulfillment and shipment, but the data model must not put shipment-specific fields directly on `orders` in a way that prevents split shipments later.

### 10.4 COD cash status

COD cash state is separate from shipment delivery:

```text
not_due -> collection_due -> collected_by_courier
-> remittance_pending -> reconciled
```

Exception outcomes include `collection_failed`, `disputed`, and `written_off`, each requiring a reason and permission-controlled resolution. Record the amount, currency, courier reference, collection time, remittance batch, reconciler, and audit history. Delivery is not proof of cash collection, and cash collection is not proof of remittance.

### 10.5 Returns

Return state:

```text
requested -> approved -> in_transit -> received -> inspected -> resolved
requested -> rejected
requested|approved -> cancelled
```

- A return request identifies order items, quantities, reason, customer notes, and evidence if supported.
- Approval, transport, receipt, inspection, inventory disposition, and resolution are distinct events.
- Support full and partial returns without replacing the original fulfillment or shipment history.
- COD refunds require an explicitly configured offline refund method, amount/currency record, recipient confirmation where appropriate, and audit trail.

## 11. Core data model

At minimum, model these entities:

- `users`, `profiles`, `roles`, `permissions`, `user_roles`
- `customer_profiles`, `addresses`, `customer_flags`
- `products`, `product_images`, `categories`, `product_categories`, `brands`
- `product_options`, `product_variants`, `variant_option_values`
- `inventory_items`, `inventory_reservations`, `inventory_movements`
- `carts`, `cart_items`
- `orders`, `order_items`, `order_addresses`, `order_lifecycle_events`, `order_verifications`
- `fulfillments`, `fulfillment_items`, `fulfillment_events`
- `shipments`, `shipment_events`, `delivery_attempts`
- `cod_collections`, `cod_reconciliations`, `cod_discrepancies`
- `coupons`, `coupon_rules`, `coupon_redemptions`
- `returns`, `return_items`, `return_events`, `refund_records`
- `reviews` if reviews are approved for MVP
- `notifications`, `notification_attempts`
- `outbox_events`, `provider_webhook_receipts`, `idempotency_keys`
- `admin_notes`, `audit_logs`
- `content_pages`, `store_settings`, `delivery_zones`, `shipping_rates`

`order_items` must snapshot product name, SKU, selected options, unit price, discount allocation, tax allocation if applicable, and quantity. Historical invoices must not change when catalog data changes.

## 12. Authentication and authorization

- Customers may use verified email or phone authentication, subject to provider support.
- Guest shopping and guest checkout do not require authentication.
- Administrators require authentication and multi-factor authentication before production launch.
- Supabase Auth owns credentials and identity sessions; application tables own profiles, roles, permissions, and business authorization. Link them by immutable identity ID rather than duplicating password data.
- Initial application access uses server-side Drizzle queries. Keep the Supabase service-role key server-only. If direct browser-to-Supabase data access is later introduced, enable and test Row Level Security for every exposed table before release.
- Enforce role/permission checks in server-side policies, not only in navigation or button visibility.
- Initial roles: Owner, Administrator, Product Manager, Order Manager, Warehouse Staff, Customer Support, and Accountant.
- Default deny: a role has no privilege unless granted.
- Sensitive operations such as role changes, cancellation after shipment, inventory adjustment, blocklisting, and reconciliation require an audit entry.

## 13. Security and privacy

- Follow the current OWASP Top 10 and framework security guidance.
- Use HTTPS in all shared environments.
- Keep secrets in environment-variable/secret management; commit only a documented `.env.example` with placeholders.
- Use secure, HTTP-only, same-site cookies where applicable.
- Protect mutations against CSRF according to the authentication architecture.
- Apply strict validation, output encoding, and safe database parameterization.
- Rate-limit authentication, OTP, search abuse, checkout, contact forms, and order lookup.
- Validate uploads by type, size, and content; generate safe object names; do not serve executable uploads.
- Configure restrictive security headers and an appropriate Content Security Policy.
- Redact personal data, session values, tokens, and addresses from logs and monitoring.
- Collect only information required for fulfillment and legal operations.
- Define data-retention and deletion/anonymization procedures before launch.
- Record consent versions for policies accepted during checkout.
- Review dependencies and CI actions for supply-chain risk.
- Do not claim compliance certification unless independently established.

## 14. SEO, performance, and accessibility

### 14.1 SEO

- Generate unique titles, descriptions, canonical URLs, sitemap entries, and robots rules.
- Use stable human-readable slugs with redirects when URLs change.
- Add valid Product, Offer, ProductGroup/variant, BreadcrumbList, Organization, shipping, and return-policy structured data as applicable.
- Prevent indexing of cart, checkout, account, admin, internal search combinations, and private order pages.
- Include Open Graph and social metadata.

### 14.2 Performance

- Optimize product media and serve responsive AVIF/WebP when supported.
- Prevent cumulative layout shift by reserving image dimensions.
- Lazy-load below-the-fold content.
- Cache public catalog reads with explicit invalidation.
- Paginate all unbounded lists.
- Add indexes based on real query paths and inspect slow queries.
- Establish launch budgets for JavaScript, image weight, and Core Web Vitals.

### 14.3 Accessibility

- Target WCAG 2.2 AA.
- Support keyboard operation, visible focus, skip navigation, semantic headings, and landmarks.
- Associate form fields with labels, help text, and errors.
- Announce cart updates and validation failures to assistive technologies.
- Provide meaningful alt text for product content and empty alt text for decorative media.
- Never use color alone to convey status.
- Test critical storefront and admin paths with automated checks and manual keyboard review.

## 15. Notifications and integrations

- Define provider-neutral interfaces for email, SMS/WhatsApp, courier, storage, and future payment services.
- Notification templates are versioned and use an allowlist of template variables.
- Record send attempts, provider IDs, success/failure, and retry state.
- Create notification and provider work through the transactional outbox in the same database transaction as the business event.
- Retry transient failures with bounded exponential backoff. Move exhausted or permanent failures to a reviewable dead-letter state; do not retry indefinitely.
- Notification failure must not roll back a successfully committed order.
- Required customer events: order received, verification required/result, confirmed, shipped, out for delivery where supported, delivered, cancelled, delivery failed, and return update.
- Courier adapters map external events to internal shipment events and retain the raw provider event securely when needed for investigation.

### 15.1 Background jobs

- The MVP worker handles outbox delivery, reservation expiry, retry scheduling, and other approved maintenance tasks.
- Scheduled invocations and jobs are at-least-once. Every job must claim work atomically, be idempotent, and tolerate duplicate or overlapping execution.
- Store job attempts, next-attempt time, terminal failure, and a correlation reference without copying unnecessary personal data.
- Use database locking or lease semantics so concurrent workers do not process the same event simultaneously.
- Keep long-running work outside request/response handlers. Do not rely on an in-memory timer in a serverless process.
- Provide an audited administrative retry path for safe failed jobs.

## 16. Testing strategy

### 16.1 Required test layers

- Unit tests: pricing, coupon rules, shipping rules, state transitions, permissions, inventory calculations, and formatting.
- Database integration tests: transactions, constraints, reservations, concurrent last-item purchase, release behavior, and idempotency.
- Worker integration tests: outbox claiming, duplicate execution, retries, dead-letter behavior, and reservation expiry.
- Component tests: forms, error states, accessible interactions, cart controls, and administrative status controls.
- End-to-end tests: browse to order, guest checkout, duplicate submission, verification, fulfillment, delivery, cancellation, return, and reconciliation.
- Security tests: authorization boundaries, tenant/record isolation where applicable, rate limits, upload validation, and sensitive data exposure.

### 16.2 Mandatory scenarios

- Two customers attempt to buy the last unit concurrently.
- A product price changes while it is in the cart.
- A variant becomes unavailable before checkout.
- Checkout is submitted twice.
- An idempotency key is reused with a different payload.
- A coupon expires or reaches its limit during checkout.
- An unsupported delivery area is submitted.
- The notification provider fails after order commit.
- Two workers try to claim the same outbox event or expired reservation.
- An order is cancelled before and after stock finalization.
- A courier sends duplicate and out-of-order events.
- Delivery is refused or fails multiple times.
- A partial return restores only approved sellable units.
- Delivered cash differs from courier remittance.
- A staff member attempts an operation outside their role.

### 16.3 Quality gates

Before merging feature work, run the repository's actual equivalents of:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Run relevant Playwright tests for user-visible flows. Before release, run the full end-to-end suite against staging. Never state that a check passed unless its output was observed.

## 17. Implementation workflow

Repository working rules, verification expectations, and external-action boundaries live in `../AGENTS.md`. Keep them there rather than duplicating them in this specification.

## 18. Implementation phases

### Phase 0: discovery and repository foundation

- Confirm assumptions in Section 3.
- Initialize Next.js, TypeScript, pnpm, linting, formatting, test tools, and environment validation.
- Establish CI, local setup, branch protections, design tokens, error handling, logging, and architectural decision records.
- Define measurable performance, accessibility, and recovery targets.

Acceptance: the clean application builds, tests run locally and in CI, environment validation fails safely, and setup is documented.

### Phase 1: database and authentication foundation

- Add database schema, migrations, seed strategy, Supabase server clients, customer sessions, staff authentication, roles, permissions, audit foundations, transactional outbox, and worker foundation.

Acceptance: migrations work from an empty database, administrative routes are protected server-side, and permission tests demonstrate default-deny behavior.

### Phase 2: catalog and inventory administration

- Implement categories, brands, products, variants, images, slugs, inventory, movements, CSV import/export, and administrative screens.

Acceptance: authorized staff can manage a complete variant product and its stock; unauthorized users cannot; inventory changes are auditable.

### Phase 3: public storefront

- Implement home, catalog, product details, search, filters, sorting, pagination, SEO, structured data, responsive images, and content pages.

Acceptance: customers can discover available products on mobile and desktop, pages meet initial accessibility/performance checks, and private routes remain unindexed.

### Phase 4: cart, pricing, and checkout

- Implement cart persistence/merge, pricing, delivery calculation, coupons, guest checkout, idempotent order creation, address snapshots, inventory reservation, and reservation-expiry processing.

Acceptance: totals are server-authoritative; duplicate submissions create one order; concurrent last-item checkout does not oversell.

### Phase 5: COD verification and fulfillment

- Add verification, fraud controls, administrative order management, packing slips, invoices, shipments, delivery attempts, notifications, and stock release/finalization.

Acceptance: staff can move an order only through allowed transitions; every action is auditable; notification failures do not corrupt orders.

### Phase 6: customer accounts, tracking, and returns

- Add saved addresses, order history, guest tracking, cancellation eligibility, returns, inspection, disposition, and offline refund records.

Acceptance: customers can access only their own orders; guest tracking requires phone verification; partial returns maintain correct quantities and inventory.

### Phase 7: COD reconciliation and reporting

- Add collection/remittance/reconciliation states, discrepancies, operational dashboard metrics, and CSV reports.

Acceptance: submitted order value, delivered merchandise value, collected cash, and reconciled cash are reported separately and trace to orders. Accounting revenue terminology is used only if the approved accounting policy defines it.

### Phase 8: production hardening and launch

- Complete security review, accessibility audit, load/performance checks, backup and restore test, monitoring, alerts, production data import, staging UAT, operational training, and deployment runbook.

Acceptance: launch checklist is approved, recovery is demonstrated, staging UAT passes, rollback is documented, and a real controlled COD smoke test succeeds after deployment.

Do not automatically begin the next phase merely because the current phase is complete. Report completion evidence and wait for the next user request.

## 19. Deployment and environments

Maintain separate environments:

- Local development: isolated local or development resources.
- Staging: production-like configuration with test providers and synthetic data.
- Production: live resources with restricted access and real provider credentials.

Required deployment controls:

- Git-based preview deployments for review.
- Protected production branch and required CI checks.
- Environment-specific secrets and database URLs.
- Scheduled worker invocation with authentication, overlap-safe execution, retry visibility, and alerting.
- Forward database migrations executed through a controlled release step.
- Backward-compatible schema/application changes for releases that cannot be atomic.
- Smoke tests after deployment.
- A documented rollback procedure for application and database changes.
- Domain, DNS, HTTPS, email-domain authentication, sitemap, and monitoring verification.

Never use production credentials in local development or automated tests.

## 20. Backup, recovery, and operations

- Enable automated production database backups with retention appropriate to business risk.
- Back up object storage separately; database backups do not automatically restore deleted media objects.
- Keep at least one off-provider backup where practical.
- Test restoration before launch and periodically afterward.
- Document recovery point objective and recovery time objective before production approval.
- Monitor availability, error rate, latency, failed jobs, notification failures, low stock, suspicious checkout activity, and failed courier webhooks.
- Maintain operational runbooks for order correction, inventory correction, provider outage, failed deployment, data restoration, and compromised staff access.

## 21. Environment variables

The eventual `.env.example` should document placeholders such as:

```dotenv
NEXT_PUBLIC_APP_URL=
DATABASE_URL=
DIRECT_DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STORAGE_BUCKET_PRODUCTS=
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM=
SMS_PROVIDER_API_KEY=
WHATSAPP_PROVIDER_API_KEY=
COURIER_PROVIDER_API_KEY=
COURIER_WEBHOOK_SECRET=
WORKER_INVOCATION_SECRET=
SENTRY_DSN=
NEXT_PUBLIC_ANALYTICS_ID=
```

Only variables intentionally safe for browsers may use the `NEXT_PUBLIC_` prefix. Validate required variables at startup and return clear configuration errors without printing secret values.

## 22. Definition of done

A feature is complete only when:

- Its observable acceptance criteria are satisfied.
- Authorization, validation, error, empty, loading, and relevant concurrency paths are handled.
- Business-critical rules have automated tests.
- Relevant lint, type, test, build, and browser checks have passed with observed output.
- Database changes include reviewed migrations and rollback/compatibility consideration.
- Accessibility and responsive behavior are checked for changed UI.
- Security and privacy impact is reviewed.
- Operational logging and monitoring are adequate without exposing personal data.
- User-facing and operator documentation is updated when behavior or setup changes.
- No secrets, debug output, placeholder production data, or unexplained suppressions are committed.

## 23. Launch checklist

- Business identity, currency, timezone, taxes, delivery zones, COD rules, and policies approved.
- Product and inventory import reconciled with the source data.
- Staff accounts, roles, MFA, and support procedures verified.
- Domain, HTTPS, security headers, email DNS, and provider webhooks verified.
- Full staging UAT completed on supported mobile and desktop browsers.
- Accessibility, SEO, performance, security, and dependency checks reviewed.
- Database and media backup plus restore procedure tested.
- Monitoring, alert contacts, incident ownership, and rollback procedure active.
- Test orders cover confirmation, packing, shipment, delivery, refusal, cancellation, return, and reconciliation.
- Search engine sitemap submission and production analytics consent behavior configured.
- Legal and policy content reviewed by an appropriate local professional.

## 24. Success measures after launch

Track, without collecting unnecessary personal data:

- Product-view-to-cart rate.
- Cart-to-checkout and checkout-to-order conversion.
- Verification success and time to confirmation.
- Duplicate/fraud rejection rate with false-positive review.
- Order cancellation and refusal rates by reason and area.
- Fulfillment and delivery duration.
- Delivery success rate by courier and zone.
- Return rate and reasons.
- Inventory mismatch and stockout frequency.
- COD collection-to-reconciliation time and discrepancies.
- Availability, error rate, page performance, and notification delivery rate.

Use measured results to prioritize later work. Do not add complex features solely because they were listed as possible future enhancements.
