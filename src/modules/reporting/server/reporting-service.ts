import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  codCollections,
  codDiscrepancies,
  codReconciliations,
  fulfillments,
  inventoryItems,
  orders,
  returnRequests,
  shipments,
} from "@/db/schema";
import { serializeCsv } from "@/modules/catalog/domain/catalog-csv";

type Database = ReturnType<typeof getDatabase>;

export type ReportRange = { from?: Date; to?: Date };

export const cashReportHeaders = [
  "order_number",
  "submitted_at_utc",
  "currency_code",
  "submitted_order_value_minor",
  "delivered_merchandise_value_minor",
  "cash_collected_minor",
  "cash_reconciled_minor",
  "cash_state",
  "courier_reference",
  "remittance_batch",
  "discrepancy_minor",
] as const;

function rangePredicate(range: ReportRange) {
  if (range.from !== undefined && range.to !== undefined)
    return and(gte(orders.createdAt, range.from), lte(orders.createdAt, range.to));
  if (range.from !== undefined) return gte(orders.createdAt, range.from);
  if (range.to !== undefined) return lte(orders.createdAt, range.to);
  return undefined;
}

function safeSpreadsheetText(value: string | null): string | null {
  if (value === null) return null;
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function getOperationalReportRows(
  range: ReportRange = {},
  database: Database = getDatabase(),
) {
  return database
    .select({
      cashCollectedMinor: codCollections.collectedAmountMinor,
      cashReconciledMinor: codReconciliations.reconciledAmountMinor,
      cashState: codCollections.state,
      courierReference: codCollections.courierReference,
      currencyCode: orders.currencyCode,
      discrepancyMinor: codDiscrepancies.differenceMinor,
      discountMinor: orders.discountMinor,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      remittanceBatch: codCollections.remittanceBatch,
      shipmentState: shipments.status,
      submittedAt: orders.createdAt,
      submittedOrderValueMinor: orders.grandTotalMinor,
      subtotalMinor: orders.subtotalMinor,
      taxMinor: orders.taxMinor,
    })
    .from(orders)
    .leftJoin(fulfillments, eq(fulfillments.orderId, orders.id))
    .leftJoin(shipments, eq(shipments.fulfillmentId, fulfillments.id))
    .leftJoin(codCollections, eq(codCollections.orderId, orders.id))
    .leftJoin(codReconciliations, eq(codReconciliations.collectionId, codCollections.id))
    .leftJoin(codDiscrepancies, eq(codDiscrepancies.collectionId, codCollections.id))
    .where(rangePredicate(range))
    .orderBy(orders.createdAt, orders.orderNumber);
}

export async function getOperationalDashboard(
  database: Database = getDatabase(),
  now = new Date(),
) {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [reportRows, pendingVerification, pendingFulfillment, failedDeliveries, activeReturns] =
    await Promise.all([
      getOperationalReportRows({}, database),
      database
        .select({ value: count() })
        .from(orders)
        .where(eq(orders.verificationState, "pending")),
      database
        .select({ value: count() })
        .from(orders)
        .where(
          and(
            eq(orders.lifecycleState, "active"),
            inArray(orders.fulfillmentState, ["unfulfilled", "processing", "packed"]),
          ),
        ),
      database
        .select({ value: count() })
        .from(shipments)
        .where(
          inArray(shipments.status, [
            "attempt_failed",
            "return_to_origin",
            "returned_to_sender",
            "lost",
            "damaged",
          ]),
        ),
      database
        .select({ value: count() })
        .from(returnRequests)
        .where(
          inArray(returnRequests.status, [
            "requested",
            "approved",
            "in_transit",
            "received",
            "inspected",
          ]),
        ),
    ]);

  const lowStock = await database
    .select({ value: count() })
    .from(inventoryItems)
    .where(
      sql`${inventoryItems.onHandQuantity} - ${inventoryItems.reservedQuantity} <= ${inventoryItems.lowStockThreshold}`,
    );
  const byCurrency = new Map<
    string,
    {
      cashAwaitingReconciliationMinor: number;
      cashCollectedMinor: number;
      cashReconciledMinor: number;
      currencyCode: string;
      deliveredMerchandiseValueMinor: number;
      openDiscrepancies: number;
      ordersToday: number;
      submittedOrderValueMinor: number;
    }
  >();
  for (const row of reportRows) {
    const summary = byCurrency.get(row.currencyCode) ?? {
      cashAwaitingReconciliationMinor: 0,
      cashCollectedMinor: 0,
      cashReconciledMinor: 0,
      currencyCode: row.currencyCode,
      deliveredMerchandiseValueMinor: 0,
      openDiscrepancies: 0,
      ordersToday: 0,
      submittedOrderValueMinor: 0,
    };
    summary.submittedOrderValueMinor += row.submittedOrderValueMinor;
    if (row.submittedAt >= startOfDay) summary.ordersToday += 1;
    if (row.shipmentState === "delivered") {
      summary.deliveredMerchandiseValueMinor +=
        row.subtotalMinor - row.discountMinor + row.taxMinor;
    }
    summary.cashCollectedMinor += row.cashCollectedMinor ?? 0;
    summary.cashReconciledMinor += row.cashReconciledMinor ?? 0;
    if (
      row.cashState !== null &&
      ["collected_by_courier", "remittance_pending", "disputed"].includes(row.cashState)
    ) {
      summary.cashAwaitingReconciliationMinor += row.cashCollectedMinor ?? 0;
    }
    if (row.cashState === "disputed") summary.openDiscrepancies += 1;
    byCurrency.set(row.currencyCode, summary);
  }

  return {
    currencies: [...byCurrency.values()].sort((a, b) =>
      a.currencyCode.localeCompare(b.currencyCode),
    ),
    counts: {
      activeReturns: activeReturns[0]?.value ?? 0,
      failedDeliveries: failedDeliveries[0]?.value ?? 0,
      lowStock: lowStock[0]?.value ?? 0,
      pendingFulfillment: pendingFulfillment[0]?.value ?? 0,
      pendingVerification: pendingVerification[0]?.value ?? 0,
    },
  };
}

export async function exportOperationalReportCsv(
  range: ReportRange = {},
  database: Database = getDatabase(),
): Promise<string> {
  const rows = await getOperationalReportRows(range, database);
  return serializeCsv([
    cashReportHeaders,
    ...rows.map((row) => [
      safeSpreadsheetText(row.orderNumber),
      row.submittedAt.toISOString(),
      row.currencyCode,
      row.submittedOrderValueMinor,
      row.shipmentState === "delivered" ? row.subtotalMinor - row.discountMinor + row.taxMinor : 0,
      row.cashCollectedMinor ?? 0,
      row.cashReconciledMinor ?? 0,
      row.cashState ?? "not_due",
      safeSpreadsheetText(row.courierReference),
      safeSpreadsheetText(row.remittanceBatch),
      row.discrepancyMinor ?? 0,
    ]),
  ]);
}
