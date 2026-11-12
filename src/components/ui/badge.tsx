import type { HTMLAttributes } from "react";

import { cx } from "./cx";
import { badgeBase, badgeStyles, type BadgeTone } from "./styles";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={cx(badgeBase, badgeStyles[tone], className)} {...props} />;
}
