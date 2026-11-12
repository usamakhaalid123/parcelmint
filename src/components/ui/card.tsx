import type { HTMLAttributes } from "react";

import { cx } from "./cx";
import { cardStyles } from "./styles";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: keyof typeof cardStyles;
};

export function Card({ className, tone = "default", ...props }: CardProps) {
  return <div className={cx(cardStyles[tone], className)} {...props} />;
}
