import type { HTMLAttributes } from "react";

import { cx } from "./cx";
import { layoutStyles } from "./styles";

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cx(layoutStyles.page, className)} id="main-content" {...props} />;
}
