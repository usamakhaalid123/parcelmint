import { randomUUID } from "node:crypto";

import { getWorkerInvocationSecret } from "@/config/operations-env";
import { secretsMatch } from "@/lib/constant-time-secret";
import { logger } from "@/lib/logger";
import { releaseExpiredReservations } from "@/modules/checkout/server/reservation-expiry-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const expectedAuthorization = `Bearer ${getWorkerInvocationSecret()}`;
  if (!secretsMatch(request.headers.get("authorization"), expectedAuthorization)) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication is required" } },
      { headers: { "Cache-Control": "no-store" }, status: 401 },
    );
  }

  const correlationId = randomUUID();
  try {
    const result = await releaseExpiredReservations();
    return Response.json(
      { data: result },
      { headers: { "Cache-Control": "no-store" }, status: 200 },
    );
  } catch (error) {
    logger.error("Reservation expiry invocation failed", { correlationId, error });
    return Response.json(
      {
        error: {
          code: "WORKER_UNAVAILABLE",
          message: "The worker could not complete this invocation",
        },
      },
      { headers: { "Cache-Control": "no-store" }, status: 503 },
    );
  }
}
