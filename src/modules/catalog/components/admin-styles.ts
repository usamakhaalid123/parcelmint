export const adminStyles = {
  main: "mx-auto min-h-[calc(100vh-4.5rem)] w-full max-w-7xl px-[clamp(1rem,4vw,3rem)] py-[clamp(2rem,6vw,5rem)]",
  pageHeader: "mb-10",
  pageHeaderRow: "mb-10 flex items-start justify-between gap-6 max-md:flex-col",
  eyebrow: "mb-4 text-xs font-extrabold tracking-[0.11em] text-primary uppercase",
  pageTitle: "mb-3 max-w-[22ch] text-[clamp(2.25rem,6vw,4.5rem)]",
  muted: "m-0 max-w-2xl text-[var(--muted)]",
  backLink: "mb-6 inline-block font-bold text-[var(--muted)] no-underline hover:text-primary",
  actionGroup: "flex flex-wrap justify-end gap-2.5 max-md:w-full max-md:justify-start",
  primaryAction:
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-primary px-4 py-2.5 font-bold text-white no-underline transition hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
  secondaryAction:
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-surface px-4 py-2.5 font-bold text-foreground no-underline transition hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
  section:
    "mb-5 rounded-3xl border border-[var(--border)] bg-surface p-[clamp(1.25rem,3vw,2rem)] shadow-[var(--shadow-card)]",
  sectionTitleRow: "mb-6 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start",
  sectionTitle: "m-0 max-w-none text-[clamp(1.5rem,3vw,2.25rem)]",
  form: "grid gap-5",
  fieldset: "rounded-2xl border border-[var(--border)] bg-surface p-[clamp(1.25rem,3vw,2rem)]",
  legend: "px-2 text-lg font-extrabold",
  formGrid: "grid grid-cols-2 gap-4 max-md:grid-cols-1",
  label: "grid content-start gap-1.5 text-sm font-bold",
  optional: "text-xs font-medium text-[var(--muted)]",
  input:
    "min-h-11 w-full rounded-lg border border-[var(--border)] bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary",
  fullSpan: "col-span-2 max-md:col-span-1",
  compactForm:
    "grid grid-cols-2 gap-4 rounded-2xl border border-[var(--border)] bg-surface p-[clamp(1.25rem,3vw,2rem)] max-md:grid-cols-1 [&_label]:grid [&_label]:content-start [&_label]:gap-1.5 [&_label]:text-sm [&_label]:font-bold [&_label_span]:text-xs [&_label_span]:font-medium [&_label_span]:text-[var(--muted)] [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-background [&_input]:px-3 [&_input]:py-2 [&_input]:focus:border-primary [&_input]:focus:outline-2 [&_input]:focus:outline-offset-1 [&_input]:focus:outline-primary [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-background [&_select]:px-3 [&_select]:py-2 [&_select]:focus:border-primary [&_select]:focus:outline-2 [&_select]:focus:outline-offset-1 [&_select]:focus:outline-primary [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-[var(--border)] [&_textarea]:bg-background [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:focus:border-primary [&_textarea]:focus:outline-2 [&_textarea]:focus:outline-offset-1 [&_textarea]:focus:outline-primary",
  alert:
    "mb-5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-3 text-[var(--danger)]",
  success: "mb-5 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-800",
  tableWrap: "overflow-x-auto rounded-2xl border border-[var(--border)] bg-surface",
  table:
    "w-full border-collapse text-left [&_td]:border-b [&_td]:border-[var(--border)] [&_td]:p-4 [&_td]:align-middle [&_th]:border-b [&_th]:border-[var(--border)] [&_th]:p-4 [&_th]:text-xs [&_th]:tracking-[0.06em] [&_th]:text-[var(--muted)] [&_th]:uppercase [&_tr:last-child_td]:border-b-0",
  pill: "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold tracking-[0.05em] uppercase whitespace-nowrap",
} as const;

export const disclosureStyles = {
  panel:
    "group mb-5 rounded-3xl border border-[var(--border)] bg-surface shadow-[var(--shadow-card)] open:border-primary/40",
  summary:
    "flex cursor-pointer list-none items-center justify-between gap-4 rounded-3xl p-[clamp(1.25rem,3vw,2rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden",
  body: "border-t border-[var(--border)] p-[clamp(1.25rem,3vw,2rem)]",
} as const;

export const statusStyles = {
  active: "bg-emerald-100 text-emerald-800",
  archived: "bg-[var(--danger-surface)] text-[var(--danger)]",
  draft: "bg-[var(--surface-strong)] text-[var(--muted)]",
} as const;

export const availabilityStyles = {
  in_stock: "bg-emerald-100 text-emerald-800",
  low_stock: "bg-amber-100 text-amber-800",
  out_of_stock: "bg-[var(--danger-surface)] text-[var(--danger)]",
  untracked: "bg-emerald-100 text-emerald-800",
} as const;
