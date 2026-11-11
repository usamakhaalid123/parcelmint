import Link from "next/link";

import { requirePermission } from "@/modules/auth/server/require-permission";
import { adminStyles } from "@/modules/catalog/components/admin-styles";
import { listAdminOrders } from "@/modules/orders/server/order-service";
import { formatMoney } from "@/modules/storefront/components/product-card";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  await requirePermission("orders.manage");
  const orders = await listAdminOrders();
  return (
    <main className={adminStyles.main} id="main-content">
      <header className={adminStyles.pageHeader}>
        <p className={adminStyles.eyebrow}>Order operations</p>
        <h1 className={adminStyles.pageTitle}>Orders</h1>
        <p className={adminStyles.muted}>
          Verification, fulfillment, shipment, and delivery states remain independently auditable.
        </p>
      </header>
      {orders.length === 0 ? (
        <section className={adminStyles.section}>
          <h2>No orders yet</h2>
          <p>Guest checkout orders will appear here.</p>
        </section>
      ) : (
        <div className={adminStyles.tableWrap}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Submitted</th>
                <th>Verification</th>
                <th>Fulfillment</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-bold">{order.orderNumber}</td>
                  <td>{order.createdAt.toLocaleString("en-PK")}</td>
                  <td>{order.verificationState.replaceAll("_", " ")}</td>
                  <td>{order.fulfillmentState}</td>
                  <td>{formatMoney(order.grandTotalMinor, order.currencyCode)}</td>
                  <td>
                    <Link href={`/admin/orders/${order.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
