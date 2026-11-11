import { notFound } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { getAdminOrder } from "@/modules/orders/server/order-service";

export const dynamic = "force-dynamic";

export default async function PackingSlipPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requirePermission("orders.manage");
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).orderId);
  if (!parsed.success) notFound();
  const detail = await getAdminOrder(parsed.data);
  if (detail === null) notFound();
  return (
    <main className="mx-auto max-w-3xl bg-white p-10" id="main-content">
      <p className="text-sm font-bold uppercase">Packing slip</p>
      <h1>{detail.order.orderNumber}</h1>
      <section>
        <h2>Deliver to</h2>
        <p>
          {detail.order.customerName}
          <br />
          {detail.addresses[0]?.addressLine}
          <br />
          {detail.addresses[0]?.deliveryArea}
        </p>
      </section>
      <table className="w-full border-collapse text-left [&_td]:border-b [&_td]:p-3 [&_th]:border-b [&_th]:p-3">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item) => (
            <tr key={item.id}>
              <td>{item.sku}</td>
              <td>{item.productName}</td>
              <td>{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-8 text-sm">
        Delivery instructions: {detail.order.deliveryInstructions ?? "None"}
      </p>
    </main>
  );
}
