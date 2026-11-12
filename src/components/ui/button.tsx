import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";
import { buttonStyles, type ButtonVariant } from "./styles";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, type = "button", variant = "primary", ...props }: ButtonProps) {
  return <button className={cx(buttonStyles[variant], className)} type={type} {...props} />;
}
