import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { adminStyles } from "@/modules/catalog/components/admin-styles";
import { permittedReturnTransitions } from "@/modules/orders/domain/return-policy";
import { permittedShipmentTransitions } from "@/modules/orders/domain/state-policy";
import {
  addAdminNoteAction,
  cancelOrderAction,
  confirmOrderAction,
  createShipmentLabelAction,
  handoffOrderAction,
  markPackedAction,
  recordDeliveryAttemptAction,
  recordOfflineRefundAction,
  rejectOrderAction,
  startProcessingAction,
  transitionShipmentAction,
  transitionReturnAction,
} from "@/modules/orders/server/actions";
import { getAdminOrder } from "@/modules/orders/server/order-service";
import { formatMoney } from "@/modules/storefront/components/product-card";

export const dynamic = "force-dynamic";

function OperationForm({
  action,
  button,
  orderId,
}: {
  action: (formData: FormData) => Promise<never>;
  button: string;
  orderId: string;
}) {
  return (
    <form action={action} className={adminStyles.compactForm}>
      <input name="orderId" type="hidden" value={orderId} />
      <label>
        Reason
        <input minLength={3} name="reason" required />
      </label>
      <button className={adminStyles.primaryAction} type="submit">
        {button}
      </button>
    </form>
  );
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requirePermission("orders.manage");
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).orderId);
  if (!parsed.success) notFound();
  const [detail, query] = await Promise.all([getAdminOrder(parsed.data), searchParams]);
  if (detail === null) notFound();
  const { order } = detail;
  const shipmentState = detail.fulfillment?.shipmentStatus ?? null;

  return (
    <main className={adminStyles.main} id="main-content">
      <Link className={adminStyles.backLink} href="/admin/orders">
        ← Orders
      </Link>
      <header className={adminStyles.pageHeaderRow}>
        <div>
          <p className={adminStyles.eyebrow}>Order operations</p>
          <h1 className={adminStyles.pageTitle}>{order.orderNumber}</h1>
          <p className={adminStyles.muted}>
            {order.verificationState} verification · {order.fulfillmentState} fulfillment
            {shipmentState === null ? "" : ` · ${shipmentState.replaceAll("_", " ")} shipment`}
          </p>
        </div>
        <div className={adminStyles.actionGroup}>
          <Link
            className={adminStyles.secondaryAction}
            href={`/admin/orders/${order.id}/packing-slip`}
          >
            Packing slip
          </Link>
          <Link className={adminStyles.secondaryAction} href={`/admin/orders/${order.id}/invoice`}>
            Invoice
          </Link>
        </div>
      </header>

      {query.error !== undefined ? (
        <p className={adminStyles.alert}>The operation was rejected.</p>
      ) : null}
      {query.notice !== undefined ? <p className={adminStyles.success}>Order updated.</p> : null}

      <section className={adminStyles.section}>
        <h2>Customer and delivery</h2>
        <dl className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <div>
            <dt className="font-bold">Customer</dt>
            <dd>{order.customerName}</dd>
          </div>
          <div>
            <dt className="font-bold">Mobile</dt>
            <dd>{order.mobileNumber}</dd>
          </div>
          <div>
            <dt className="font-bold">Email</dt>
            <dd>{order.email ?? "Not supplied"}</dd>
          </div>
          <div>
            <dt className="font-bold">Address</dt>
            <dd>{detail.addresses[0]?.addressLine ?? "Unavailable"}</dd>
          </div>
        </dl>
        {detail.riskFlags.length > 0 ? (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <strong>Internal review flags</strong>
            <ul>
              {detail.riskFlags.map((flag) => (
                <li key={flag.id}>{flag.code.replaceAll("_", " ")}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className={adminStyles.section}>
        <h2>Commercial snapshot</h2>
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}</td>
                  <td>{item.sku}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.unitPriceMinor, item.currencyCode)}</td>
                  <td>{formatMoney(item.lineTotalMinor, item.currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-right text-xl font-black">
          Total: {formatMoney(order.grandTotalMinor, order.currencyCode)}
        </p>
      </section>

      <section className={adminStyles.section}>
        <h2>Permitted operations</h2>
        <div className="grid gap-4">
          {order.verificationState === "pending" ? (
            <>
              <OperationForm
                action={confirmOrderAction}
                button="Confirm COD order"
                orderId={order.id}
              />
              <OperationForm action={rejectOrderAction} button="Reject order" orderId={order.id} />
            </>
          ) : null}
          {order.verificationState === "confirmed" && order.fulfillmentState === "unfulfilled" ? (
            <OperationForm
              action={startProcessingAction}
              button="Start processing"
              orderId={order.id}
            />
          ) : null}
          {order.fulfillmentState === "processing" ? (
            <OperationForm action={markPackedAction} button="Mark packed" orderId={order.id} />
          ) : null}
          {shipmentState === "pending" ? (
            <form action={createShipmentLabelAction} className={adminStyles.compactForm}>
              <input name="orderId" type="hidden" value={order.id} />
              <label>
                Courier code
                <input minLength={2} name="courierCode" required />
              </label>
              <label>
                Tracking number
                <input minLength={2} name="trackingNumber" required />
              </label>
              <label>
                Reason
                <input minLength={3} name="reason" required />
              </label>
              <button className={adminStyles.primaryAction} type="submit">
                Create shipment label
              </button>
            </form>
          ) : null}
          {order.fulfillmentState === "packed" && shipmentState === "label_created" ? (
            <OperationForm
              action={handoffOrderAction}
              button="Hand to courier"
              orderId={order.id}
            />
          ) : null}
          {shipmentState !== null &&
          permittedShipmentTransitions(shipmentState).length > 0 &&
          shipmentState !== "pending" &&
          shipmentState !== "label_created" ? (
            <form action={transitionShipmentAction} className={adminStyles.compactForm}>
              <input name="orderId" type="hidden" value={order.id} />
              <label>
                Next shipment state
                <select name="nextState" required>
                  {permittedShipmentTransitions(shipmentState).map((state) => (
                    <option key={state} value={state}>
                      {state.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reason
                <input minLength={3} name="reason" required />
              </label>
              <button className={adminStyles.primaryAction} type="submit">
                Update shipment
              </button>
            </form>
          ) : null}
          {shipmentState === "out_for_delivery" || shipmentState === "attempt_failed" ? (
            <form action={recordDeliveryAttemptAction} className={adminStyles.compactForm}>
              <input name="orderId" type="hidden" value={order.id} />
              <label>
                Outcome
                <select name="outcome">
                  <option value="failed">Failed</option>
                  <option value="refused">Refused</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="delivered">Delivered</option>
                </select>
              </label>
              <label>
                Reason
                <input minLength={3} name="reason" required />
              </label>
              <button className={adminStyles.secondaryAction} type="submit">
                Record attempt
              </button>
            </form>
          ) : null}
          {order.lifecycleState === "active" ? (
            <OperationForm action={cancelOrderAction} button="Cancel order" orderId={order.id} />
          ) : null}
        </div>
      </section>

      <section className={adminStyles.section}>
        <h2>Returns and offline refunds</h2>
        {detail.returns.length === 0 ? <p>No returns requested.</p> : null}
        {detail.returns.map((entry) => (
          <article
            className="mb-4 rounded-xl bg-white p-4"
            key={`${entry.returnId}-${entry.itemId}`}
          >
            <h3>{entry.productName}</h3>
            <p>
              {entry.status.replaceAll("_", " ")} · requested {entry.requestedQuantity} · approved{" "}
              {entry.approvedQuantity} · received {entry.receivedQuantity} · sellable{" "}
              {entry.sellableQuantity}
            </p>
            {permittedReturnTransitions(entry.status).length > 0 ? (
              <form action={transitionReturnAction} className={adminStyles.compactForm}>
                <input name="orderId" type="hidden" value={order.id} />
                <input name="returnId" type="hidden" value={entry.returnId} />
                <input name="itemId" type="hidden" value={entry.itemId} />
                <label>
                  Next return state
                  <select name="nextState" required>
                    {permittedReturnTransitions(entry.status).map((state) => (
                      <option key={state} value={state}>
                        {state.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sellable quantity after inspection
                  <input
                    max={entry.receivedQuantity}
                    min={0}
                    name="sellableQuantity"
                    type="number"
                    defaultValue={0}
                  />
                </label>
                <label>
                  Reason
                  <input minLength={3} name="reason" required />
                </label>
                <button className={adminStyles.primaryAction} type="submit">
                  Update return
                </button>
              </form>
            ) : null}
            {entry.status === "resolved" && entry.refundAmountMinor === null ? (
              <form action={recordOfflineRefundAction} className={adminStyles.compactForm}>
                <input name="orderId" type="hidden" value={order.id} />
                <input name="returnId" type="hidden" value={entry.returnId} />
                <input name="currencyCode" type="hidden" value={order.currencyCode} />
                <label>
                  Refund amount (minor units)
                  <input min={1} name="amountMinor" required type="number" />
                </label>
                <label>
                  Method
                  <select name="method">
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="mobile_wallet">Mobile wallet</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Reference
                  <input minLength={2} name="externalReference" required />
                </label>
                <label>
                  <input name="recipientConfirmed" type="checkbox" /> Recipient confirmed
                </label>
                <button className={adminStyles.secondaryAction} type="submit">
                  Record offline refund
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </section>

      <section className={adminStyles.section}>
        <h2>Private notes</h2>
        <form action={addAdminNoteAction} className={adminStyles.compactForm}>
          <input name="orderId" type="hidden" value={order.id} />
          <input name="reason" type="hidden" value="Private operational note" />
          <label>
            Note
            <textarea maxLength={2000} minLength={2} name="note" required rows={3} />
          </label>
          <button className={adminStyles.secondaryAction} type="submit">
            Add private note
          </button>
        </form>
        {detail.notes.map((note) => (
          <p className="rounded-xl bg-white p-3" key={note.id}>
            {note.note}
          </p>
        ))}
      </section>

      <section className={adminStyles.section}>
        <h2>Audit timeline</h2>
        {detail.events.length === 0 ? (
          <p>No operational transitions yet.</p>
        ) : (
          <ol>
            {detail.events.map((event) => (
              <li key={event.id}>
                <strong>{event.concern}</strong>: {event.previousState} → {event.newState} —{" "}
                {event.reason}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
