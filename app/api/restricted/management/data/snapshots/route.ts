import type { NextRequest } from "next/server";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { logActivity } from "@/lib/management/activity-logger";
import * as dataManager from "@/lib/management/data-manager";
import { invalidate } from "@/lib/routing-fast";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const result = await dataManager.getSnapshotCleanupStats();
  return oneOf(result).match(
    stats => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(stats).build(),
    error => ApiResponseBuilder.createFromFailure(error).build(),
  );
}

export async function DELETE(request: NextRequest) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const type = request.nextUrl.searchParams.get("type");
  if (type !== "orphaned" && type !== "unused") {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{
      message: "Query parameter \"type\" must be \"orphaned\" or \"unused\".",
    }]).build();
  }

  const result = type === "orphaned"
    ? await dataManager.deleteOrphanedSnapshots()
    : await dataManager.deleteUnusedSnapshots();

  return oneOf(result).match(
    (summary) => {
      void invalidate();
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: type === "orphaned" ? "orphaned_snapshots_deleted" : "unused_snapshots_deleted",
        summary: type === "orphaned"
          ? `Deleted ${summary.routeSnapshotsDeleted} orphaned route snapshots and ${summary.regionSnapshotsDeleted} orphaned region snapshots`
          : `Deleted ${summary.routeSnapshotsDeleted} unused route snapshots and ${summary.regionSnapshotsDeleted} unused region snapshots`,
        routePath: "/api/restricted/management/data/snapshots",
        httpMethod: "DELETE",
        statusCode: StatusCodes.Status200Ok,
        payload: { type, ...summary },
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(summary).build();
    },
    error => ApiResponseBuilder.createFromFailure(error).build(),
  );
}
