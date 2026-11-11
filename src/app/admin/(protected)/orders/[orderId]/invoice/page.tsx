import { notFound } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { getAdminOrder } from "@/modules/orders/server/order-service";
import { formatMoney } from "@/modules/storefront/components/product-card";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ orderId: string }> }) {
  await requirePermission("orders.manage");
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).orderId);
  if (!parsed.success) notFound();
  const detail = await getAdminOrder(parsed.data);
  if (detail === null) notFound();
  const { order } = detail;
  return (
    <main className="mx-auto max-w-3xl bg-white p-10" id="main-content">
      <p className="text-sm font-bold uppercase">Cash-on-delivery invoice</p>
      <h1>{order.orderNumber}</h1>
      <p>Submitted {order.createdAt.toLocaleString("en-PK")}</p>
      <table className="w-full border-collapse text-left [&_td]:border-b [&_td]:p-3 [&_th]:border-b [&_th]:p-3">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Unit</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.productName}
                <br />
                <small>{item.sku}</small>
              </td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.unitPriceMinor, item.currencyCode)}</td>
              <td>{formatMoney(item.lineTotalMinor, item.currencyCode)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-2 text-right">
        <dt>Subtotal</dt>
        <dd>{formatMoney(order.subtotalMinor, order.currencyCode)}</dd>
        <dt>Discount</dt>
        <dd>−{formatMoney(order.discountMinor, order.currencyCode)}</dd>
        <dt>Delivery</dt>
        <dd>{formatMoney(order.shippingMinor, order.currencyCode)}</dd>
        <dt className="font-black">COD total</dt>
        <dd className="font-black">{formatMoney(order.grandTotalMinor, order.currencyCode)}</dd>
      </dl>
      <p className="mt-8 text-sm">
        This commercial snapshot is generated from the submitted order and does not change with
        later catalog edits.
      </p>
    </main>
  );
}
