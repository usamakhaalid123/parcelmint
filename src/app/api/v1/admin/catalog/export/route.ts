import { authorizePermission } from "@/modules/auth/domain/authorization";
import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import { exportCatalogCsv } from "@/modules/catalog/server/catalog-export-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const decision = authorizePermission(await getCurrentPrincipal(), "catalog.manage");
  if (!decision.allowed) {
    return Response.json(
      { error: { code: "forbidden", message: "Catalog export access denied." } },
      { headers: { "Cache-Control": "no-store" }, status: 403 },
    );
  }

  const csv = await exportCatalogCsv();

  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="parcelmint-catalog-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
