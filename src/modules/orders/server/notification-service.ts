import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { notificationAttempts, notifications, orders } from "@/db/schema";
import type { OutboxHandlers } from "@/modules/jobs/server/outbox-worker";

export type NotificationMessage = {
  channel: "sms";
  destination: string;
  templateKey: string;
  templateVersion: "1";
  variables: Readonly<Record<"orderNumber", string>>;
};

export type NotificationSender = {
  send(message: NotificationMessage): Promise<{ providerId: string }>;
};

const supportedTopics = new Set([
  "order.received",
  "order.verification_required",
  "order.confirmed",
  "order.verification_rejected",
  "order.reservation_expired",
  "order.shipped",
  "order.out_for_delivery",
  "order.delivered",
  "order.delivery_failed",
  "order.cancelled",
]);

const payloadSchema = z.object({ orderId: z.string().uuid() });

export function createNotificationOutboxHandlers(
  sender: NotificationSender,
  database: ReturnType<typeof getDatabase> = getDatabase(),
): OutboxHandlers {
  return Object.fromEntries(
    [...supportedTopics].map((topic) => [
      topic,
      async (event) => {
        const payload = payloadSchema.parse(event.payload);
        const [order] = await database
          .select({ mobileNumber: orders.mobileNumber, orderNumber: orders.orderNumber })
          .from(orders)
          .where(eq(orders.id, payload.orderId))
          .limit(1);
        if (order === undefined) throw new Error("OrderNotFound");

        const [notification] = await database
          .insert(notifications)
          .values({
            channel: "sms",
            eventType: topic,
            orderId: payload.orderId,
            templateVersion: "1",
          })
          .onConflictDoUpdate({
            set: { updatedAt: new Date() },
            target: [notifications.orderId, notifications.eventType, notifications.channel],
          })
          .returning({ id: notifications.id });
        if (notification === undefined) throw new Error("NotificationNotPersisted");
        const [attempts] = await database
          .select({ value: count() })
          .from(notificationAttempts)
          .where(eq(notificationAttempts.notificationId, notification.id));
        const attemptNumber = (attempts?.value ?? 0) + 1;

        try {
          const result = await sender.send({
            channel: "sms",
            destination: order.mobileNumber,
            templateKey: topic,
            templateVersion: "1",
            variables: { orderNumber: order.orderNumber },
          });
          await database.transaction(async (transaction) => {
            await transaction.insert(notificationAttempts).values({
              attemptNumber,
              notificationId: notification.id,
              outcome: "sent",
              providerId: result.providerId,
            });
            await transaction
              .update(notifications)
              .set({ status: "sent", updatedAt: new Date() })
              .where(eq(notifications.id, notification.id));
          });
        } catch {
          await database.transaction(async (transaction) => {
            await transaction.insert(notificationAttempts).values({
              attemptNumber,
              errorCode: "provider_failed",
              notificationId: notification.id,
              outcome: "failed",
            });
            await transaction
              .update(notifications)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(notifications.id, notification.id));
          });
          throw new Error("NotificationProviderFailed");
        }
      },
    ]),
  );
}

export const unavailableNotificationSender: NotificationSender = {
  async send() {
    throw new Error("NotificationProviderNotConfigured");
  },
};
