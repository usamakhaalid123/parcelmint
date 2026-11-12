import { authorizePermission } from "@/modules/auth/domain/authorization";
import { getCurrentPrincipal } from "@/modules/auth/server/current-principal";
import { exportOperationalReportCsv } from "@/modules/reporting/server/reporting-service";

export const dynamic = "force-dynamic";

function parseDate(value: string | null, endOfDay: boolean): Date | undefined {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  const decision = authorizePermission(await getCurrentPrincipal(), "reports.read");
  if (!decision.allowed) {
    return Response.json(
      { error: { code: "forbidden", message: "Operational report access denied." } },
      { headers: { "Cache-Control": "no-store" }, status: 403 },
    );
  }
  const url = new URL(request.url);
  const from = parseDate(url.searchParams.get("from"), false);
  const to = parseDate(url.searchParams.get("to"), true);
  if (from !== undefined && to !== undefined && from > to) {
    return Response.json(
      { error: { code: "invalid_range", message: "The report date range is invalid." } },
      { headers: { "Cache-Control": "no-store" }, status: 400 },
    );
  }
  const csv = await exportOperationalReportCsv({ from, to });
  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="parcelmint-cod-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
