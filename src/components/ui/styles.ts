/**
 * ParcelMint's Tailwind-first primitive styles. Keep variants semantic so pages
 * reuse the same interaction, color, spacing, and accessibility decisions.
 */
const buttonBase =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold no-underline shadow-sm transition duration-200 ease-out hover:-translate-y-px focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--focus)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none";

export const buttonStyles = {
  danger: `${buttonBase} border-danger-border bg-danger-surface text-danger hover:border-danger`,
  ghost: `${buttonBase} border-transparent bg-transparent text-muted-strong shadow-none hover:bg-surface-strong hover:text-foreground`,
  primary: `${buttonBase} border-primary bg-primary text-white hover:border-primary-hover hover:bg-primary-hover active:border-primary-active active:bg-primary-active`,
  secondary: `${buttonBase} border-border-strong bg-surface text-foreground hover:border-primary hover:text-primary`,
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export const fieldStyles = {
  control:
    "min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground shadow-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-3 focus:ring-primary-soft disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted",
  help: "text-xs leading-5 text-muted",
  label: "grid content-start gap-1.5 text-sm font-bold text-foreground",
  textarea:
    "min-h-28 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-foreground shadow-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-3 focus:ring-primary-soft disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted",
} as const;

export const alertBase = "rounded-lg border p-4 text-sm font-medium";

export const alertStyles = {
  error: "border-danger-border bg-danger-surface text-danger",
  info: "border-info-border bg-info-surface text-info",
  success: "border-success-border bg-success-surface text-success",
  warning: "border-warning-border bg-warning-surface text-warning",
} as const;

export type AlertTone = keyof typeof alertStyles;

export const badgeBase =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold tracking-wide uppercase whitespace-nowrap";

export const badgeStyles = {
  danger: "border-danger-border bg-danger-surface text-danger",
  info: "border-info-border bg-info-surface text-info",
  neutral: "border-border bg-surface-strong text-muted-strong",
  success: "border-success-border bg-success-surface text-success",
  warning: "border-warning-border bg-warning-surface text-warning",
} as const;

export type BadgeTone = keyof typeof badgeStyles;

export const cardStyles = {
  default: "rounded-card border border-border bg-surface p-6 shadow-card",
  interactive:
    "rounded-card border border-border bg-surface p-6 shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:border-primary hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none",
  muted: "rounded-card border border-border bg-surface-strong p-6",
} as const;

export const layoutStyles = {
  page: "mx-auto min-h-[calc(100vh-4.5rem)] w-full max-w-[var(--content-width)] px-4 py-10 sm:px-6 lg:px-12 lg:py-16",
  storefront: "mx-auto w-full max-w-[var(--content-width)] px-4 sm:px-6 lg:px-12",
} as const;

export const tableStyles = {
  root: "w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-border [&_td]:p-4 [&_td]:align-middle [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-strong [&_th]:p-4 [&_th]:text-xs [&_th]:font-bold [&_th]:tracking-wider [&_th]:text-muted [&_th]:uppercase [&_tr:last-child_td]:border-b-0",
  shell: "overflow-x-auto rounded-card border border-border bg-surface shadow-sm",
} as const;
