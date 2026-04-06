import type { NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ResponseComposer, StatusCodes } from "@/lib/http";
import { getActivityLogs, logDashboardVisit } from "@/lib/management/activity-logger";

export async function GET(request: NextRequest) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(currentSession)
      .orchestrate();
  }

  void logDashboardVisit({
    actorUserId: currentSession.user!.id,
    actorRole: currentSession.user!.role,
    routePath: "/dashboard/logs",
    summary: "Visited activity logs dashboard",
  });

  const searchParams = request.nextUrl.searchParams;
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(searchParams.get("pageSize") ?? "20", 10);
  const action = searchParams.get("action") ?? undefined;
  const category = searchParams.get("category") ?? undefined;

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100
    ? pageSize
    : 20;

  const data = await getActivityLogs({
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize,
    action,
    category,
  });

  return ResponseComposer.compose(StatusCodes.Status200Ok)
    .setBody({
      rows: data.rows,
      total: data.total,
      page: safePage,
      pageSize: safePageSize,
    })
    .orchestrate();
}
