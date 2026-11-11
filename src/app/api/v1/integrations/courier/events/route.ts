import { getCourierWebhookSecret } from "@/config/operations-env";
import { secretsMatch } from "@/lib/constant-time-secret";
import { OrderNotFoundError, OrderTransitionError } from "@/modules/orders";
import { applyCourierEvent } from "@/modules/orders/server/order-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const expectedAuthorization = `Bearer ${getCourierWebhookSecret()}`;
  if (!secretsMatch(request.headers.get("authorization"), expectedAuthorization)) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication is required" } },
      { headers: { "Cache-Control": "no-store" }, status: 401 },
    );
  }
  try {
    const result = await applyCourierEvent(await request.json());
    return Response.json(
      { data: result },
      { headers: { "Cache-Control": "no-store" }, status: 200 },
    );
  } catch (error) {
    const conflict = error instanceof OrderTransitionError;
    const notFound = error instanceof OrderNotFoundError;
    return Response.json(
      {
        error: {
          code: conflict ? "INVALID_TRANSITION" : notFound ? "SHIPMENT_NOT_FOUND" : "INVALID_EVENT",
          message: conflict
            ? "The event does not follow the shipment state policy"
            : notFound
              ? "The shipment was not found"
              : "The event payload is invalid",
        },
      },
      { headers: { "Cache-Control": "no-store" }, status: conflict ? 409 : notFound ? 404 : 400 },
    );
  }
}
