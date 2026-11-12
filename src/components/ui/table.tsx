import type { HTMLAttributes, TableHTMLAttributes } from "react";

import { cx } from "./cx";
import { tableStyles } from "./styles";

export function TableShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(tableStyles.shell, className)} {...props} />;
}

export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cx(tableStyles.root, className)} {...props} />;
}
