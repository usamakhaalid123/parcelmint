import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import {
  adminStyles,
  availabilityStyles,
  statusStyles,
} from "@/modules/catalog/components/admin-styles";
import {
  addVariantAction,
  adjustInventoryAction,
  changeProductStatusAction,
  uploadProductImageAction,
  updateProductAction,
} from "@/modules/catalog/server/actions";
import {
  getCatalogProduct,
  listProductInventoryMovements,
} from "@/modules/catalog/server/catalog-repository";

const notices: Readonly<Record<string, string>> = {
  created: "Product created successfully.",
  "status-updated": "Product lifecycle status updated.",
  "stock-adjusted": "Stock adjusted and recorded in inventory history.",
  "variant-created": "Variant created successfully.",
  "image-uploaded": "Product image uploaded successfully.",
  "product-updated": "Product details updated successfully.",
};

const errors: Readonly<Record<string, string>> = {
  insufficient_on_hand: "The adjustment would make on-hand inventory negative.",
  invalid_input: "Review the submitted values.",
  invalid_file: "Choose a JPEG, PNG, or WebP image no larger than 5 MB.",
  operation_failed: "The operation failed. Try again or review server logs.",
  reserved_quantity_conflict: "The adjustment would reduce stock below reserved quantity.",
  storage_failed: "The image could not be stored. Confirm the product image bucket exists.",
  untracked_variant: "Inventory cannot be adjusted for an untracked variant.",
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { productId } = await params;
  const [product, principal, query, movements] = await Promise.all([
    getCatalogProduct(productId),
    getCurrentPrincipal(),
    searchParams,
    listProductInventoryMovements(productId),
  ]);
  if (product === null) notFound();

  const canManageCatalog = principal?.permissionKeys.has("catalog.manage") ?? false;
  const canAdjustInventory = principal?.permissionKeys.has("inventory.adjust") ?? false;
  const notice = query.notice === undefined ? undefined : notices[query.notice];
  const error = query.error === undefined ? undefined : errors[query.error];

  return (
    <main className={adminStyles.main} id="main-content">
      <header className={adminStyles.pageHeaderRow}>
        <div>
          <Link className={adminStyles.backLink} href="/admin/catalog">
            ← Products
          </Link>
          <p className={adminStyles.eyebrow}>{product.slug}</p>
          <h1 className={adminStyles.pageTitle}>{product.name}</h1>
          <p className={adminStyles.muted}>
            {product.currencyCode} {product.basePriceMinor.toLocaleString()} minor units
            {product.brandName === null ? "" : ` · ${product.brandName}`}
          </p>
        </div>
        <span className={`${adminStyles.pill} ${statusStyles[product.status]}`}>
          {product.status}
        </span>
      </header>

      {notice === undefined ? null : (
        <p className={adminStyles.success} role="status">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <p className={adminStyles.alert} role="alert">
          {error}
        </p>
      )}

      <section className={adminStyles.section} aria-labelledby="variants-title">
        <div className={adminStyles.sectionTitleRow}>
          <div>
            <p className={adminStyles.eyebrow}>Inventory</p>
            <h2 className={adminStyles.sectionTitle} id="variants-title">
              Variants
            </h2>
          </div>
          <span className="text-[var(--muted)]">{product.variants.length} total</span>
        </div>
        <div className="grid gap-4">
          {product.variants.map((variant) => (
            <article
              className="rounded-2xl border border-[var(--border)] bg-background p-5"
              key={variant.id}
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h3 className="mb-1">{variant.title}</h3>
                  <p className="m-0 font-mono text-sm text-[var(--muted)]">{variant.sku}</p>
                </div>
                <span className={`${adminStyles.pill} ${availabilityStyles[variant.availability]}`}>
                  {variant.availability.replaceAll("_", " ")}
                </span>
              </div>
              <dl className="my-5 grid grid-cols-4 gap-3 max-md:grid-cols-2 [&_dt]:text-xs [&_dt]:text-[var(--muted)] [&_dt]:uppercase">
                <div className="rounded-lg bg-surface p-3">
                  <dt>On hand</dt>
                  <dd className="mt-1 text-xl font-extrabold">{variant.onHandQuantity}</dd>
                </div>
                <div className="rounded-lg bg-surface p-3">
                  <dt>Reserved</dt>
                  <dd className="mt-1 text-xl font-extrabold">{variant.reservedQuantity}</dd>
                </div>
                <div className="rounded-lg bg-surface p-3">
                  <dt>Available</dt>
                  <dd className="mt-1 text-xl font-extrabold">
                    {variant.onHandQuantity - variant.reservedQuantity}
                  </dd>
                </div>
                <div className="rounded-lg bg-surface p-3">
                  <dt>Low at</dt>
                  <dd className="mt-1 text-xl font-extrabold">{variant.lowStockThreshold}</dd>
                </div>
              </dl>
              {canAdjustInventory && variant.stockBehavior === "tracked" ? (
                <form
                  action={adjustInventoryAction}
                  className="grid grid-cols-[minmax(8rem,0.5fr)_minmax(14rem,1fr)_auto] items-end gap-3 rounded-2xl border border-[var(--border)] bg-surface p-4 max-md:grid-cols-1 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-background [&_input]:px-3 [&_input]:py-2 [&_label]:grid [&_label]:gap-1.5 [&_label]:text-sm [&_label]:font-bold"
                >
                  <input name="productId" type="hidden" value={product.id} />
                  <input name="inventoryItemId" type="hidden" value={variant.inventoryItemId} />
                  <label>
                    Quantity delta
                    <input name="delta" placeholder="+5 or -2" required step={1} type="number" />
                  </label>
                  <label>
                    Audit reason
                    <input maxLength={500} minLength={3} name="reason" required />
                  </label>
                  <button className={adminStyles.secondaryAction} type="submit">
                    Adjust stock
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className={adminStyles.section} aria-labelledby="movement-history-title">
        <div className={adminStyles.sectionTitleRow}>
          <div>
            <p className={adminStyles.eyebrow}>Audit trail</p>
            <h2 className={adminStyles.sectionTitle} id="movement-history-title">
              Inventory movements
            </h2>
          </div>
          <span className="text-[var(--muted)]">Latest 50</span>
        </div>
        {movements.length === 0 ? (
          <p className="m-0 text-sm text-[var(--muted)]">No stock movements have been recorded.</p>
        ) : (
          <div className={adminStyles.tableWrap}>
            <table className={adminStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Source</th>
                  <th scope="col">Delta</th>
                  <th scope="col">After</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.occurredAt.toISOString()}</td>
                    <td>{movement.sku}</td>
                    <td>{movement.source.replaceAll("_", " ")}</td>
                    <td>{movement.delta > 0 ? `+${movement.delta}` : movement.delta}</td>
                    <td>{movement.quantityAfter}</td>
                    <td>{movement.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManageCatalog ? (
        <div className="grid grid-cols-[1.35fr_0.65fr] gap-5 max-md:grid-cols-1">
          <section
            className={`${adminStyles.section} col-span-2 max-md:col-span-1`}
            aria-labelledby="edit-product-title"
          >
            <p className={adminStyles.eyebrow}>Product details</p>
            <h2 className={`${adminStyles.sectionTitle} mb-5`} id="edit-product-title">
              Edit product
            </h2>
            <form action={updateProductAction} className={adminStyles.compactForm}>
              <input name="productId" type="hidden" value={product.id} />
              <input name="version" type="hidden" value={product.version} />
              <label>
                Name
                <input defaultValue={product.name} maxLength={200} name="name" required />
              </label>
              <label>
                Slug
                <input defaultValue={product.slug} maxLength={160} name="slug" required />
              </label>
              <label>
                Base price <span>(minor units)</span>
                <input
                  defaultValue={product.basePriceMinor}
                  min={0}
                  name="basePriceMinor"
                  required
                  step={1}
                  type="number"
                />
              </label>
              <label>
                Currency
                <input
                  defaultValue={product.currencyCode}
                  maxLength={3}
                  minLength={3}
                  name="currencyCode"
                  required
                />
              </label>
              <label className={adminStyles.fullSpan}>
                Description
                <textarea
                  defaultValue={product.description}
                  maxLength={20000}
                  name="description"
                  rows={4}
                />
              </label>
              <label className={adminStyles.fullSpan}>
                Audit reason
                <input minLength={3} name="reason" required />
              </label>
              <button
                className={`${adminStyles.secondaryAction} ${adminStyles.fullSpan}`}
                type="submit"
              >
                Save product details
              </button>
            </form>
          </section>
          <section className={adminStyles.section} aria-labelledby="add-variant-title">
            <p className={adminStyles.eyebrow}>Catalog</p>
            <h2 className={`${adminStyles.sectionTitle} mb-5`} id="add-variant-title">
              Add a variant
            </h2>
            <form action={addVariantAction} className={adminStyles.compactForm}>
              <input name="productId" type="hidden" value={product.id} />
              <label>
                Variant title
                <input name="variantTitle" required />
              </label>
              <label>
                SKU
                <input name="sku" required />
              </label>
              <label>
                Price override <span>(minor units)</span>
                <input min={0} name="priceOverrideMinor" step={1} type="number" />
              </label>
              <label>
                Stock behavior
                <select defaultValue="tracked" name="stockBehavior">
                  <option value="tracked">Tracked</option>
                  <option value="untracked">Untracked</option>
                </select>
              </label>
              <label>
                Option name <span>(optional)</span>
                <input name="optionName" placeholder="Size" />
              </label>
              <label>
                Option value <span>(optional)</span>
                <input name="optionValue" placeholder="Medium" />
              </label>
              <label>
                Opening quantity
                <input
                  defaultValue={0}
                  min={0}
                  name="initialQuantity"
                  required
                  step={1}
                  type="number"
                />
              </label>
              <label>
                Low-stock threshold
                <input
                  defaultValue={0}
                  min={0}
                  name="lowStockThreshold"
                  required
                  step={1}
                  type="number"
                />
              </label>
              <label className={adminStyles.fullSpan}>
                Inventory reason
                <input minLength={3} name="inventoryReason" required />
              </label>
              <button
                className={`${adminStyles.primaryAction} ${adminStyles.fullSpan}`}
                type="submit"
              >
                Add variant
              </button>
            </form>
          </section>

          <section className={adminStyles.section} aria-labelledby="lifecycle-title">
            <p className={adminStyles.eyebrow}>Lifecycle</p>
            <h2 className={`${adminStyles.sectionTitle} mb-5`} id="lifecycle-title">
              Change status
            </h2>
            <form
              action={changeProductStatusAction}
              className={`${adminStyles.compactForm} grid-cols-1`}
            >
              <input name="productId" type="hidden" value={product.id} />
              <label>
                New status
                <select defaultValue={product.status} name="status">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                Audit reason
                <input minLength={3} name="reason" required />
              </label>
              <button className={adminStyles.secondaryAction} type="submit">
                Update status
              </button>
            </form>
          </section>

          <section className={adminStyles.section} aria-labelledby="images-title">
            <p className={adminStyles.eyebrow}>Media</p>
            <h2 className={`${adminStyles.sectionTitle} mb-5`} id="images-title">
              Product images
            </h2>
            {product.images.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No images uploaded yet.</p>
            ) : (
              <ul className="mb-4 grid list-none gap-2 p-0">
                {product.images.map((image) => (
                  <li
                    className="grid grid-cols-[6rem_1fr] items-center gap-4 rounded-lg bg-background p-3 max-sm:grid-cols-1"
                    key={image.id}
                  >
                    <Image
                      alt={image.altText}
                      className="aspect-square w-24 rounded-lg border border-[var(--border)] object-cover"
                      height={96}
                      src={`/api/v1/admin/catalog/images/${image.id}`}
                      unoptimized
                      width={96}
                    />
                    <div className="grid gap-1">
                      <strong>{image.altText}</strong>
                      <span className="text-xs text-[var(--muted)]">
                        {image.isPrimary ? "Primary image" : "Additional image"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={uploadProductImageAction}
              className={`${adminStyles.compactForm} grid-cols-1`}
            >
              <input name="productId" type="hidden" value={product.id} />
              <label>
                Image file
                <input
                  accept="image/jpeg,image/png,image/webp"
                  name="imageFile"
                  required
                  type="file"
                />
              </label>
              <label>
                Alternative text
                <input maxLength={300} name="altText" required />
              </label>
              <label className="flex! grid-cols-[auto_1fr] items-center!">
                <input className="min-h-4! w-4!" name="isPrimary" type="checkbox" />
                Use as primary product image
              </label>
              <button className={adminStyles.secondaryAction} type="submit">
                Upload image
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
