/**
 * GET /api/reports/export?kind=tasks&from=…&to=… — CSV download.
 *
 * The export runs through the same report scope as the screen, so a manager can
 * only export their own teams, and every export is written to the audit log.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { fail } from "@/server/respond";
import { exportReportCsv, type ExportKind } from "@/server/services/reports";
import { recordAudit } from "@/server/services/activity";
import { reportRangeSchema } from "@/lib/validation";
import { DAY_MS } from "@/lib/dates";

const KINDS: ExportKind[] = ["tasks", "employees", "teams", "progress", "blockers", "late"];

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const params = request.nextUrl.searchParams;

    const kindParam = (params.get("kind") ?? "tasks") as ExportKind;
    if (!KINDS.includes(kindParam)) {
      throw new AppError("VALIDATION", `Unknown export kind. Choose one of: ${KINDS.join(", ")}.`);
    }

    const parsed = reportRangeSchema.parse({
      from: params.get("from"),
      to: params.get("to"),
      teamId: params.get("teamId"),
      projectId: params.get("projectId"),
    });
    const to = parsed.to ?? new Date();
    const from = parsed.from ?? new Date(to.getTime() - 30 * DAY_MS);

    const csv = await exportReportCsv(user, kindParam, {
      from,
      to,
      teamId: parsed.teamId,
      projectId: parsed.projectId,
    });

    await recordAudit({
      actorId: user.id,
      action: "REPORT_EXPORTED",
      entityType: "Report",
      entityId: kindParam,
      after: { from, to, teamId: parsed.teamId, projectId: parsed.projectId, bytes: csv.length },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cadence-${kindParam}-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const failure = fail(error);
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json(failure, { status });
  }
}
