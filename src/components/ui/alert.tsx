import type { HTMLAttributes } from "react";

import { cx } from "./cx";
import { alertBase, alertStyles, type AlertTone } from "./styles";

export type AlertProps = HTMLAttributes<HTMLDivElement> & { tone?: AlertTone };

export function Alert({ className, role, tone = "info", ...props }: AlertProps) {
  return (
    <div
      className={cx(alertBase, alertStyles[tone], className)}
      role={role ?? (tone === "error" ? "alert" : "status")}
      {...props}
    />
  );
}
