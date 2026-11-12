import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  auditLogs,
  codCashEvents,
  codCollections,
  codDiscrepancies,
  codReconciliations,
  orders,
} from "@/db/schema";
import { authorizePermission, type StaffPrincipal } from "@/modules/auth";
import {
  canTransitionCodCash,
  type CodCashState,
} from "@/modules/reporting/domain/cash-state-policy";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const operationSchema = z.object({
  correlationId: z.string().uuid(),
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

type OperationInput = z.input<typeof operationSchema> & { actor: StaffPrincipal | null };

async function authorize(input: OperationInput, action: string, database: Database) {
  const decision = authorizePermission(input.actor, "cash.reconcile");
  if (decision.allowed) return decision.principal;
  await database.insert(auditLogs).values({
    action,
    actorUserId: input.actor?.userId,
    correlationId: input.correlationId,
    outcome: "denied",
    reason: decision.reason,
    resourceId: input.orderId,
    resourceType: "cod_collection",
  });
  throw new Error("cash_reconciliation_denied");
}

async function lockCollection(transaction: Transaction, orderId: string) {
  const [collection] = await transaction
    .select()
    .from(codCollections)
    .where(eq(codCollections.orderId, orderId))
    .for("update")
    .limit(1);
  if (collection === undefined) throw new Error("cash_collection_not_found");
  return collection;
}

async function recordTransition(
  transaction: Transaction,
  input: {
    action: string;
    actorUserId: string;
    collectionId: string;
    correlationId: string;
    newState: CodCashState;
    orderId: string;
    previousState: CodCashState;
    reason: string;
  },
) {
  if (!canTransitionCodCash(input.previousState, input.newState)) {
    throw new Error("invalid_cash_transition");
  }
  await transaction.insert(codCashEvents).values({
    actorUserId: input.actorUserId,
    collectionId: input.collectionId,
    correlationId: input.correlationId,
    newState: input.newState,
    previousState: input.previousState,
    reason: input.reason,
  });
  await transaction.insert(auditLogs).values({
    action: input.action,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    metadata: { newState: input.newState, previousState: input.previousState },
    outcome: "success",
    reason: input.reason,
    resourceId: input.orderId,
    resourceType: "cod_collection",
  });
}

export async function recordCourierCollection(
  input: OperationInput & {
    collectedAmountMinor: number;
    collectedAt: Date;
    courierReference: string;
  },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationSchema
    .extend({
      collectedAmountMinor: z.number().int().nonnegative(),
      collectedAt: z.date().max(new Date()),
      courierReference: z.string().trim().min(2).max(160),
    })
    .parse(input);
  const principal = await authorize(input, "cash.collection.record", database);
  await database.transaction(async (transaction) => {
    const collection = await lockCollection(transaction, values.orderId);
    await recordTransition(transaction, {
      action: "cash.collection.record",
      actorUserId: principal.userId,
      collectionId: collection.id,
      correlationId: values.correlationId,
      newState: "collected_by_courier",
      orderId: values.orderId,
      previousState: collection.state,
      reason: values.reason,
    });
    await transaction
      .update(codCollections)
      .set({
        collectedAmountMinor: values.collectedAmountMinor,
        collectedAt: values.collectedAt,
        courierReference: values.courierReference,
        state: "collected_by_courier",
        updatedAt: new Date(),
      })
      .where(eq(codCollections.id, collection.id));
  });
}

export async function recordCollectionFailure(
  input: OperationInput,
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationSchema.parse(input);
  const principal = await authorize(input, "cash.collection.fail", database);
  await database.transaction(async (transaction) => {
    const collection = await lockCollection(transaction, values.orderId);
    await recordTransition(transaction, {
      action: "cash.collection.fail",
      actorUserId: principal.userId,
      collectionId: collection.id,
      correlationId: values.correlationId,
      newState: "collection_failed",
      orderId: values.orderId,
      previousState: collection.state,
      reason: values.reason,
    });
    await transaction
      .update(codCollections)
      .set({ state: "collection_failed", updatedAt: new Date() })
      .where(eq(codCollections.id, collection.id));
  });
}

export async function writeOffFailedCollection(
  input: OperationInput,
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationSchema.parse(input);
  const principal = await authorize(input, "cash.collection.write_off", database);
  await database.transaction(async (transaction) => {
    const collection = await lockCollection(transaction, values.orderId);
    await recordTransition(transaction, {
      action: "cash.collection.write_off",
      actorUserId: principal.userId,
      collectionId: collection.id,
      correlationId: values.correlationId,
      newState: "written_off",
      orderId: values.orderId,
      previousState: collection.state,
      reason: values.reason,
    });
    await transaction
      .update(codCollections)
      .set({ state: "written_off", updatedAt: new Date() })
      .where(eq(codCollections.id, collection.id));
  });
}

export async function recordRemittanceBatch(
  input: OperationInput & { remittanceBatch: string },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationSchema
    .extend({ remittanceBatch: z.string().trim().min(2).max(160) })
    .parse(input);
  const principal = await authorize(input, "cash.remittance.record", database);
  await database.transaction(async (transaction) => {
    const collection = await lockCollection(transaction, values.orderId);
    await recordTransition(transaction, {
      action: "cash.remittance.record",
      actorUserId: principal.userId,
      collectionId: collection.id,
      correlationId: values.correlationId,
      newState: "remittance_pending",
      orderId: values.orderId,
      previousState: collection.state,
      reason: values.reason,
    });
    await transaction
      .update(codCollections)
      .set({
        remittanceBatch: values.remittanceBatch,
        remittanceRecordedAt: new Date(),
        state: "remittance_pending",
        updatedAt: new Date(),
      })
      .where(eq(codCollections.id, collection.id));
  });
}

export async function reconcileCashCollection(
  input: OperationInput & { remittedAmountMinor: number },
  database: Database = getDatabase(),
): Promise<{ discrepancy: boolean }> {
  const values = operationSchema
    .extend({ remittedAmountMinor: z.number().int().nonnegative() })
    .parse(input);
  const principal = await authorize(input, "cash.reconciliation.record", database);
  return database.transaction(async (transaction) => {
    const collection = await lockCollection(transaction, values.orderId);
    if (collection.collectedAmountMinor === null) throw new Error("collection_amount_missing");
    const differenceMinor = values.remittedAmountMinor - collection.collectedAmountMinor;
    const nextState = differenceMinor === 0 ? "reconciled" : "disputed";
    await recordTransition(transaction, {
      action: "cash.reconciliation.record",
      actorUserId: principal.userId,
      collectionId: collection.id,
      correlationId: values.correlationId,
      newState: nextState,
      orderId: values.orderId,
      previousState: collection.state,
      reason: values.reason,
    });
    if (differenceMinor === 0) {
      await transaction.insert(codReconciliations).values({
        actorUserId: principal.userId,
        collectionId: collection.id,
        currencyCode: collection.currencyCode,
        reason: values.reason,
        reconciledAmountMinor: values.remittedAmountMinor,
      });
    } else {
      await transaction.insert(codDiscrepancies).values({
        actualAmountMinor: values.remittedAmountMinor,
        collectionId: collection.id,
        currencyCode: collection.currencyCode,
        differenceMinor,
        expectedAmountMinor: collection.collectedAmountMinor,
        reason: values.reason,
      });
    }
    await transaction
      .update(codCollections)
      .set({ state: nextState, updatedAt: new Date() })
      .where(eq(codCollections.id, collection.id));
    return { discrepancy: differenceMinor !== 0 };
  });
}

export async function resolveCashDiscrepancy(
  input: OperationInput & { resolution: "accept_actual" | "write_off" },
  database: Database = getDatabase(),
): Promise<void> {
  const values = operationSchema
    .extend({ resolution: z.enum(["accept_actual", "write_off"]) })
    .parse(input);
  const principal = await authorize(input, "cash.discrepancy.resolve", database);
  await database.transaction(async (transaction) => {
    const collection = await lockCollection(transaction, values.orderId);
    const [discrepancy] = await transaction
      .select()
      .from(codDiscrepancies)
      .where(
        and(eq(codDiscrepancies.collectionId, collection.id), eq(codDiscrepancies.status, "open")),
      )
      .for("update")
      .limit(1);
    if (discrepancy === undefined) throw new Error("cash_discrepancy_not_found");
    const nextState = values.resolution === "accept_actual" ? "reconciled" : "written_off";
    await recordTransition(transaction, {
      action: "cash.discrepancy.resolve",
      actorUserId: principal.userId,
      collectionId: collection.id,
      correlationId: values.correlationId,
      newState: nextState,
      orderId: values.orderId,
      previousState: collection.state,
      reason: values.reason,
    });
    if (values.resolution === "accept_actual") {
      await transaction.insert(codReconciliations).values({
        actorUserId: principal.userId,
        collectionId: collection.id,
        currencyCode: collection.currencyCode,
        reason: values.reason,
        reconciledAmountMinor: discrepancy.actualAmountMinor,
      });
    }
    await transaction
      .update(codDiscrepancies)
      .set({
        resolutionReason: values.reason,
        resolvedAt: new Date(),
        resolvedByUserId: principal.userId,
        status: values.resolution === "accept_actual" ? "resolved" : "written_off",
      })
      .where(eq(codDiscrepancies.id, discrepancy.id));
    await transaction
      .update(codCollections)
      .set({ state: nextState, updatedAt: new Date() })
      .where(eq(codCollections.id, collection.id));
  });
}

export async function listCashCollections(database: Database = getDatabase()) {
  return database
    .select({
      collectedAmountMinor: codCollections.collectedAmountMinor,
      collectedAt: codCollections.collectedAt,
      courierReference: codCollections.courierReference,
      currencyCode: codCollections.currencyCode,
      discrepancyDifferenceMinor: codDiscrepancies.differenceMinor,
      discrepancyStatus: codDiscrepancies.status,
      expectedAmountMinor: codCollections.expectedAmountMinor,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      remittanceBatch: codCollections.remittanceBatch,
      state: codCollections.state,
      updatedAt: codCollections.updatedAt,
    })
    .from(codCollections)
    .innerJoin(orders, eq(orders.id, codCollections.orderId))
    .leftJoin(codDiscrepancies, eq(codDiscrepancies.collectionId, codCollections.id))
    .orderBy(desc(codCollections.updatedAt));
}
