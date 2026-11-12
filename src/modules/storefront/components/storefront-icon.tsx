import type { SVGProps } from "react";

const paths = {
  account: (
    <>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.75 19.25a6.25 6.25 0 0 1 12.5 0" />
    </>
  ),
  arrow: <path d="m9 18 6-6-6-6" />,
  bag: (
    <>
      <path d="M5.5 8.5h13l-1 11h-11l-1-11Z" />
      <path d="M9 9V6.5a3 3 0 0 1 6 0V9" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7 9.5h.01M17 14.5h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.25 4.25L19.5 6.5" />,
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  package: (
    <>
      <path d="m4 8 8-4 8 4v8l-8 4-8-4V8Z" />
      <path d="m4.5 8 7.5 4 7.5-4M12 12v8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.25" />
      <path d="m15.25 15.25 4.5 4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.25c0 4.25-2.75 7.5-7 9.25-4.25-1.75-7-5-7-9.25V6l7-2.5Z" />
      <path d="m8.75 12 2 2 4.5-4.5" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v10H3zM14 10h3.5l3 3v3H14z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17.5" cy="18" r="1.5" />
    </>
  ),
} as const;

export type StorefrontIconName = keyof typeof paths;

export function StorefrontIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: StorefrontIconName }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      {...props}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}
