import {
  alertBase,
  alertStyles,
  badgeBase,
  badgeStyles,
  buttonStyles,
  cardStyles,
  fieldStyles,
  layoutStyles,
  tableStyles,
} from "@/components/ui";

export const adminStyles = {
  main: layoutStyles.page,
  pageHeader: "mb-10",
  pageHeaderRow: "mb-10 flex items-start justify-between gap-6 max-md:flex-col",
  eyebrow: "mb-4 text-xs font-extrabold tracking-[0.11em] text-primary uppercase",
  pageTitle: "mb-3 max-w-[22ch] text-[clamp(2.25rem,6vw,4.5rem)]",
  muted: "m-0 max-w-2xl text-[var(--muted)]",
  backLink: "mb-6 inline-block font-bold text-[var(--muted)] no-underline hover:text-primary",
  actionGroup: "flex flex-wrap justify-end gap-2.5 max-md:w-full max-md:justify-start",
  primaryAction: buttonStyles.primary,
  secondaryAction: buttonStyles.secondary,
  section: `${cardStyles.default} mb-5`,
  sectionTitleRow: "mb-6 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start",
  sectionTitle: "m-0 max-w-none text-[clamp(1.5rem,3vw,2.25rem)]",
  form: "grid gap-5",
  fieldset: "rounded-2xl border border-[var(--border)] bg-surface p-[clamp(1.25rem,3vw,2rem)]",
  legend: "px-2 text-lg font-extrabold",
  formGrid: "grid grid-cols-2 gap-4 max-md:grid-cols-1",
  label: "grid content-start gap-1.5 text-sm font-bold",
  optional: "text-xs font-medium text-[var(--muted)]",
  input: fieldStyles.control,
  fullSpan: "col-span-2 max-md:col-span-1",
  compactForm:
    "grid grid-cols-2 gap-4 rounded-2xl border border-[var(--border)] bg-surface p-[clamp(1.25rem,3vw,2rem)] max-md:grid-cols-1 [&_label]:grid [&_label]:content-start [&_label]:gap-1.5 [&_label]:text-sm [&_label]:font-bold [&_label_span]:text-xs [&_label_span]:font-medium [&_label_span]:text-[var(--muted)] [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-background [&_input]:px-3 [&_input]:py-2 [&_input]:focus:border-primary [&_input]:focus:outline-2 [&_input]:focus:outline-offset-1 [&_input]:focus:outline-primary [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-background [&_select]:px-3 [&_select]:py-2 [&_select]:focus:border-primary [&_select]:focus:outline-2 [&_select]:focus:outline-offset-1 [&_select]:focus:outline-primary [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-[var(--border)] [&_textarea]:bg-background [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:focus:border-primary [&_textarea]:focus:outline-2 [&_textarea]:focus:outline-offset-1 [&_textarea]:focus:outline-primary",
  alert: `${alertBase} ${alertStyles.error} mb-5`,
  success: `${alertBase} ${alertStyles.success} mb-5`,
  tableWrap: tableStyles.shell,
  table: tableStyles.root,
  pill: badgeBase,
} as const;

export const disclosureStyles = {
  panel:
    "group mb-5 rounded-3xl border border-[var(--border)] bg-surface shadow-[var(--shadow-card)] open:border-primary/40",
  summary:
    "flex cursor-pointer list-none items-center justify-between gap-4 rounded-3xl p-[clamp(1.25rem,3vw,2rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden",
  body: "border-t border-[var(--border)] p-[clamp(1.25rem,3vw,2rem)]",
} as const;

export const statusStyles = {
  active: badgeStyles.success,
  archived: badgeStyles.danger,
  draft: badgeStyles.neutral,
} as const;

export const availabilityStyles = {
  in_stock: badgeStyles.success,
  low_stock: badgeStyles.warning,
  out_of_stock: badgeStyles.danger,
  untracked: badgeStyles.success,
} as const;
