"use client";

import type { MouseEvent, ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  className,
  confirmation,
  formAction,
}: {
  children: ReactNode;
  className: string;
  confirmation: string;
  formAction: (formData: FormData) => Promise<never>;
}) {
  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) event.preventDefault();
  }

  return (
    <button className={className} formAction={formAction} onClick={confirmSubmission} type="submit">
      {children}
    </button>
  );
}
