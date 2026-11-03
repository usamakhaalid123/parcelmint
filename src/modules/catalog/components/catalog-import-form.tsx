"use client";

import { useActionState } from "react";

import { adminStyles } from "@/modules/catalog/components/admin-styles";
import { importCatalogCsvAction, type CatalogImportState } from "@/modules/catalog/server/actions";

const initialState: CatalogImportState = { status: "idle" };

export function CatalogImportForm() {
  const [state, action, pending] = useActionState(importCatalogCsvAction, initialState);

  return (
    <form action={action} className={adminStyles.form}>
      <fieldset className={adminStyles.fieldset}>
        <legend className={adminStyles.legend}>Upload catalog CSV</legend>
        <div className="grid gap-4">
          <label className={adminStyles.label}>
            CSV file
            <input
              className={adminStyles.input}
              accept=".csv,text/csv"
              name="catalogFile"
              required
              type="file"
            />
          </label>
          <p className="m-0 text-sm text-[var(--muted)]">
            Maximum 2 MB. The complete file is validated before one atomic database transaction.
          </p>
        </div>
      </fieldset>

      {state.status === "success" ? (
        <p className={adminStyles.success} role="status">
          Imported {state.importedProducts} products successfully.
        </p>
      ) : null}
      {state.status === "error" ? (
        <div className={adminStyles.alert} role="alert">
          <p>{state.message}</p>
          {state.issues.length === 0 ? null : (
            <ul>
              {state.issues.map((issue, index) => (
                <li key={`${issue.row}-${issue.field}-${index}`}>
                  Row {issue.row}, {issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <button
        className={`${adminStyles.primaryAction} justify-self-start`}
        disabled={pending}
        type="submit"
      >
        {pending ? "Validating…" : "Import products"}
      </button>
    </form>
  );
}
