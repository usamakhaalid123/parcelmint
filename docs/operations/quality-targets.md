# Initial quality and recovery targets

These are engineering targets for the MVP. Revisit them with measured production traffic and the
selected infrastructure plan before launch.

## Performance

Measure the 75th percentile on representative mobile traffic:

- Largest Contentful Paint: at most 2.5 seconds.
- Interaction to Next Paint: at most 200 milliseconds.
- Cumulative Layout Shift: at most 0.1.
- Public catalog pages must remain usable on a throttled 4G connection.

## Accessibility

- Meet WCAG 2.2 AA for critical customer and administrator journeys.
- Have no critical automated accessibility findings in checkout or order administration.
- Complete manual keyboard and screen-reader smoke checks before launch.

## Reliability and recovery

- Availability target after launch: 99.9% monthly, excluding approved maintenance.
- Initial recovery point objective: at most 24 hours of production database data.
- Initial recovery time objective: restore essential ordering operations within 4 hours.
- Back up database and object storage independently.
- Demonstrate a staging restore before launch and at least quarterly afterward.

These targets do not constitute a contractual service-level agreement.
