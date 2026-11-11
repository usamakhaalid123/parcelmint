import { and, count, eq, gte } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { rateLimitEvents } from "@/db/schema";

export async function consumeRateLimit(
  action: string,
  subjectHash: string,
  limit: number,
  windowMilliseconds: number,
  database: ReturnType<typeof getDatabase> = getDatabase(),
): Promise<boolean> {
  const now = new Date();
  await database.insert(rateLimitEvents).values({ action, occurredAt: now, subjectHash });
  const [usage] = await database
    .select({ value: count() })
    .from(rateLimitEvents)
    .where(
      and(
        eq(rateLimitEvents.action, action),
        eq(rateLimitEvents.subjectHash, subjectHash),
        gte(rateLimitEvents.occurredAt, new Date(now.getTime() - windowMilliseconds)),
      ),
    );
  return (usage?.value ?? 0) <= limit;
}
