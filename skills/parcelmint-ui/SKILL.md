---
name: parcelmint-ui
description: Design, implement, or revise ParcelMint storefront, checkout, account, tracking, and administration interfaces. Use whenever repository work creates or changes user-visible UI; do not use for backend-only changes with no rendered interface impact.
---

# ParcelMint UI

Preserve existing product behavior, authorization, accessibility, and responsive functionality while making the interface feel cohesive, trustworthy, and polished.

## Visual direction

- Use a warm off-white background, deep charcoal text, and one emerald or teal primary color.
- Reserve semantic colors for success, warning, error, and operational states.
- Prefer soft rounded cards, high-quality product photography, and a compact, data-focused administration interface.
- Use a professional font pairing such as Manrope with Inter or Plus Jakarta Sans with Inter. Reuse the established pairing once selected.
- Use an 8px spacing system, consistent content widths, generous whitespace, restrained shadows, and appropriately sized headings.

## Interface priorities

- Maintain a consistent design system for colors, typography, spacing, borders, shadows, buttons, inputs, alerts, and status badges. Extend shared tokens and components instead of introducing page-specific variants.
- Improve the storefront first when a task spans multiple areas: strengthen the hero, product imagery and cards, price hierarchy, trust messaging, delivery information, and calls to action.
- Keep cart and checkout concise. Use clear progress, an understandable order summary, delivery estimates, COD explanation, and reassuring validation and confirmation states.
- Present account and tracking information as a clear order timeline instead of a collection of plain text and forms.
- Structure administration around sidebar navigation, metric cards, searchable and filterable tables, clear status badges, and compact action panels.
- Provide intentional empty, loading, validation, success, and error states.
- Keep motion subtle and functional: button feedback, card hover, drawers, notifications, and timeline transitions. Respect reduced-motion preferences.

## Tailwind-first architecture

- Use the repository's Tailwind CSS v4 setup for UI implementation. Keep responsive layout, spacing, sizing, alignment, typography application, and interaction states in Tailwind utility classes.
- Keep `src/app/globals.css` minimal. It may contain `@import "tailwindcss"`, semantic brand tokens, Tailwind `@theme` mappings, essential `@layer base` behavior, focus treatment, and reduced-motion defaults. Do not add page-specific layouts or feature-specific component styling there.
- Define only semantic, brand-specific tokens globally: canvas and surface colors, foreground and muted text, primary and semantic state colors, font variables, intentional radii, and shared shadows. Do not duplicate Tailwind's standard spacing or sizing scales without a concrete need.
- Use Tailwind's standard spacing scale to maintain the 8px rhythm, favoring increments such as `gap-2`, `p-4`, `gap-6`, and `p-8`.
- Build reusable, typed React primitives under `src/components/ui/` for buttons, fields, alerts, badges, cards, page containers, and tables. Compose their variants from Tailwind utilities instead of creating page-specific global CSS classes.
- Use shared variant maps for repeated semantic states. Do not scatter independently chosen success, warning, error, or operational colors across pages.
- Load selected fonts through `next/font` and expose them as CSS variables. Do not depend on runtime third-party font stylesheets.
- Add custom CSS only when Tailwind utilities cannot clearly express a necessary behavior. Keep such CSS narrowly scoped and document why it is needed.
- Extend existing shared primitives before creating a new visual pattern. Do not introduce a styling library or variant dependency unless it provides a demonstrated benefit and is approved within the task scope.

## Modernization phases

For broad UI modernization, work through these phases in order. Finish and verify the current phase before starting the next one. A narrowly requested fix or feature may be implemented independently when it does not imply a broader redesign.

### UI-1: Design foundations

- Establish color, typography, spacing, radius, border, shadow, motion, and responsive-layout tokens.
- Standardize shared buttons, inputs, selects, text areas, alerts, status badges, cards, tables, page containers, and focus states.
- Preserve existing behavior while replacing inconsistent visual primitives.

Complete UI-1 when shared primitives are documented in code, representative existing pages use them, and formatting, type, lint, accessibility-focused checks, and responsive smoke tests pass.

### UI-2: Storefront

- Modernize the global header, navigation, homepage hero, catalog, filters, product cards, product detail pages, imagery, price hierarchy, trust messaging, delivery information, and calls to action.
- Keep discovery fast and preserve SEO, server rendering, product availability, and mobile usability.

Complete UI-2 when the primary browse-to-product journey is consistent and verified on mobile, tablet, and desktop.

### UI-3: Purchase and customer experience

- Modernize cart, checkout, order summary, progress feedback, delivery estimates, COD explanation, confirmation, customer account, saved addresses, guest tracking, cancellation, and returns.
- Use an understandable order timeline for tracking and account order details.

Complete UI-3 when guest COD checkout and customer order-management journeys remain functional, accessible, responsive, and covered by relevant browser tests.

### UI-4: Administration

- Introduce compact sidebar navigation, useful dashboard metrics, searchable and filterable tables, consistent operational status badges, and focused action panels.
- Apply the system to catalog, inventory, orders, returns, COD reconciliation, reports, and supporting administrative screens without weakening server authorization.

Complete UI-4 when primary staff workflows are visually consistent, permission-safe, keyboard accessible, responsive at supported administration widths, and verified by relevant tests.

### UI-5: Design QA

- Review all changed experiences for visual consistency, responsive behavior, keyboard navigation, focus visibility, contrast, reduced motion, loading, empty, validation, success, and error states.
- Resolve material accessibility and visual regressions, then run the complete relevant quality gates and production build.

Complete UI-5 only when the modernization is ready to feed into Phase 8 accessibility, performance, staging UAT, and launch hardening.

## Phase handling

- At the start of broad UI work, inspect the repository to determine the first incomplete UI phase; do not infer completion from file presence alone.
- State which UI phase is being implemented and keep edits within that phase unless a shared prerequisite is necessary.
- Preserve completed phases while working on later ones. Reuse their tokens and components rather than creating parallel styles.
- Report the completed phase, changed surfaces, observed checks, and any remaining limitations. Do not mark a phase complete without observed verification against its completion criteria.

## Implementation checks

- Reuse server components by default and add client components only for genuine browser interaction.
- Confirm UI changes remain Tailwind-first and that `globals.css` contains no new page-specific or feature-specific rules.
- Preserve semantic HTML, keyboard navigation, visible focus, sufficient contrast, useful labels, and reduced-motion behavior.
- Check changed screens at mobile, tablet, and desktop widths. Avoid horizontal overflow and ensure primary actions remain easy to find.
- Keep commercial values and operational statuses server-authoritative; visual controls must not bypass existing permission or state-transition rules.
- Add or update focused tests for changed interactions and run the repository's relevant formatting, type, lint, browser, and build checks.
