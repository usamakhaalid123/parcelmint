import Link from "next/link";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { adminStyles } from "@/modules/catalog/components/admin-styles";
import { createProductAction } from "@/modules/catalog/server/actions";

const errorMessages: Readonly<Record<string, string>> = {
  invalid_input: "Review the fields and provide valid values.",
  operation_failed: "The product could not be created. Try again or review server logs.",
  sku_conflict: "That SKU is already in use.",
  slug_conflict: "That product slug is already in use.",
};

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("catalog.manage");
  const errorCode = (await searchParams).error;
  const errorMessage = errorCode === undefined ? undefined : errorMessages[errorCode];

  return (
    <main className={adminStyles.main} id="main-content">
      <header className={adminStyles.pageHeader}>
        <Link className={adminStyles.backLink} href="/admin/catalog">
          ← Products
        </Link>
        <p className={adminStyles.eyebrow}>New catalog item</p>
        <h1 className={adminStyles.pageTitle}>Create a complete product</h1>
        <p className={adminStyles.muted}>
          Start with the product, its first variant, and an auditable opening stock quantity.
        </p>
      </header>

      {errorMessage === undefined ? null : (
        <p className={adminStyles.alert} role="alert">
          {errorMessage}
        </p>
      )}

      <form action={createProductAction} className={adminStyles.form}>
        <fieldset className={adminStyles.fieldset}>
          <legend className={adminStyles.legend}>Product</legend>
          <div className={adminStyles.formGrid}>
            <label className={adminStyles.label}>
              Product name
              <input className={adminStyles.input} maxLength={200} name="name" required />
            </label>
            <label className={adminStyles.label}>
              Slug <span className={adminStyles.optional}>(optional; generated from name)</span>
              <input
                className={adminStyles.input}
                maxLength={160}
                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
            </label>
            <label className={`${adminStyles.label} ${adminStyles.fullSpan}`}>
              Description
              <textarea
                className={adminStyles.input}
                maxLength={20000}
                name="description"
                rows={5}
              />
            </label>
            <label className={adminStyles.label}>
              Base price in minor units
              <input
                className={adminStyles.input}
                min={0}
                name="basePriceMinor"
                required
                step={1}
                type="number"
              />
            </label>
            <label className={adminStyles.label}>
              ISO currency code
              <input
                className={adminStyles.input}
                maxLength={3}
                minLength={3}
                name="currencyCode"
                placeholder="PKR"
                required
              />
            </label>
            <label className={adminStyles.label}>
              Lifecycle status
              <select className={adminStyles.input} defaultValue="draft" name="status">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className={adminStyles.fieldset}>
          <legend className={adminStyles.legend}>Organization</legend>
          <div className={adminStyles.formGrid}>
            <label className={adminStyles.label}>
              Brand name <span className={adminStyles.optional}>(optional)</span>
              <input className={adminStyles.input} maxLength={120} name="brandName" />
            </label>
            <label className={adminStyles.label}>
              Brand slug <span className={adminStyles.optional}>(optional)</span>
              <input
                className={adminStyles.input}
                maxLength={160}
                name="brandSlug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
            </label>
            <label className={adminStyles.label}>
              Category name <span className={adminStyles.optional}>(optional)</span>
              <input className={adminStyles.input} maxLength={120} name="categoryName" />
            </label>
            <label className={adminStyles.label}>
              Category slug <span className={adminStyles.optional}>(optional)</span>
              <input
                className={adminStyles.input}
                maxLength={160}
                name="categorySlug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={adminStyles.fieldset}>
          <legend className={adminStyles.legend}>First variant</legend>
          <div className={adminStyles.formGrid}>
            <label className={adminStyles.label}>
              Variant title
              <input
                className={adminStyles.input}
                maxLength={160}
                name="variantTitle"
                placeholder="Default or Green / Medium"
                required
              />
            </label>
            <label className={adminStyles.label}>
              SKU
              <input className={adminStyles.input} maxLength={100} name="sku" required />
            </label>
            <label className={adminStyles.label}>
              Price override in minor units <span className={adminStyles.optional}>(optional)</span>
              <input
                className={adminStyles.input}
                min={0}
                name="priceOverrideMinor"
                step={1}
                type="number"
              />
            </label>
            <label className={adminStyles.label}>
              Stock behavior
              <select className={adminStyles.input} defaultValue="tracked" name="stockBehavior">
                <option value="tracked">Tracked</option>
                <option value="untracked">Untracked</option>
              </select>
            </label>
            <label className={adminStyles.label}>
              Option name <span className={adminStyles.optional}>(optional)</span>
              <input
                className={adminStyles.input}
                maxLength={80}
                name="optionName"
                placeholder="Color"
              />
            </label>
            <label className={adminStyles.label}>
              Option value <span className={adminStyles.optional}>(optional)</span>
              <input
                className={adminStyles.input}
                maxLength={120}
                name="optionValue"
                placeholder="Green"
              />
            </label>
            <label className={adminStyles.label}>
              Weight in grams <span className={adminStyles.optional}>(optional)</span>
              <input
                className={adminStyles.input}
                min={1}
                name="weightGrams"
                step={1}
                type="number"
              />
            </label>
            <div className={`${adminStyles.fullSpan} grid grid-cols-3 gap-4 max-md:grid-cols-1`}>
              <label className={adminStyles.label}>
                Length (mm)
                <input
                  className={adminStyles.input}
                  min={1}
                  name="lengthMillimeters"
                  step={1}
                  type="number"
                />
              </label>
              <label className={adminStyles.label}>
                Width (mm)
                <input
                  className={adminStyles.input}
                  min={1}
                  name="widthMillimeters"
                  step={1}
                  type="number"
                />
              </label>
              <label className={adminStyles.label}>
                Height (mm)
                <input
                  className={adminStyles.input}
                  min={1}
                  name="heightMillimeters"
                  step={1}
                  type="number"
                />
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset className={adminStyles.fieldset}>
          <legend className={adminStyles.legend}>Opening inventory</legend>
          <div className={adminStyles.formGrid}>
            <label className={adminStyles.label}>
              On-hand quantity
              <input
                className={adminStyles.input}
                defaultValue={0}
                min={0}
                name="initialQuantity"
                required
                step={1}
                type="number"
              />
            </label>
            <label className={adminStyles.label}>
              Low-stock threshold
              <input
                className={adminStyles.input}
                defaultValue={0}
                min={0}
                name="lowStockThreshold"
                required
                step={1}
                type="number"
              />
            </label>
            <label className={`${adminStyles.label} ${adminStyles.fullSpan}`}>
              Inventory reason
              <input
                className={adminStyles.input}
                maxLength={500}
                minLength={3}
                name="inventoryReason"
                placeholder="Opening count verified by…"
                required
              />
            </label>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button className={adminStyles.primaryAction} type="submit">
            Create product
          </button>
          <Link className={adminStyles.secondaryAction} href="/admin/catalog">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
