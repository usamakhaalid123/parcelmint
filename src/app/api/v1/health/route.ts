import { getServerEnvironment } from "@/config/env";

export const dynamic = "force-dynamic";

export function GET() {
  const environment = getServerEnvironment();

  return Response.json(
    {
      environment: environment.deployment,
      status: "ok",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
