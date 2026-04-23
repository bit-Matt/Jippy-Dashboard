import type { NextRequest } from "next/server";

import * as region from "@/lib/management/region-manager";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { session, SessionCode } from "@/lib/auth";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf, unwrap, UnwrappedException } from "@/lib/one-of";
import { utils, validator } from "@/lib/validator";
import { logActivity } from "@/lib/management/activity-logger";
import { invalidate } from "@/lib/routing-fast";

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Invalid closure ID" }])
      .build();
  }

  const result = await region.getRegionById(id);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody(s)
      .build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "Invalid closure ID" }])
      .build();
  }

  const data = await tryParseJson<RequestBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  // Validate the body first.
  const validation = await validator.validate<RequestBody>(data, {
    properties: {
      snapshotName: { type: "string", formatter: "non-empty-string" },
      snapshotState: {
        type: "string",
        formatterFn: async (value) => {
          if (value === undefined) return { ok: true };
          if (["wip", "for_approval", "ready"].includes(value)) return { ok: true };
          return { ok: false, error: "Invalid snapshot state." };
        },
      },
      regionName: { type: "string", formatter: "non-empty-string" },
      regionShape: { type: "string", formatter: "non-empty-string" },
      regionColor: { type: "string", formatter: "hex-color" },
      points: {
        type: "object",
        formatterFn: async (values) => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "Invalid points." };
          }

          if (values.length < 2) {
            return { ok: false, error: "Invalid points." };
          }

          for (const point of values) {
            if (!utils.isExisty(point.sequence) || !utils.isFinite(point.sequence)) {
              return { ok: false, error: "Invalid sequence." };
            }

            if (!utils.isExisty(point.point) || !utils.isTuple(point.point)) {
              return { ok: false, error: "Invalid point." };
            }
          }

          return { ok: true };
        },
      },
      stations: {
        type: "object",
        formatterFn: async (values) => {
          if (!Array.isArray(values)) {
            return { ok: false, error: "Invalid points." };
          }

          for (const point of values) {
            if (utils.isExisty(point.address) && !utils.isNonEmpty(point.address)) {
              return { ok: false, error: "Invalid address." };
            }

            if (!utils.isExisty(point.point) || !utils.isTuple(point.point)) {
              return { ok: false, error: "Invalid point." };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["snapshotName", "regionName", "regionColor", "regionShape", "points", "stations"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  if (data.snapshotState === "ready" && currentSession.user?.role !== "administrator_user") {
    return ApiResponseBuilder.createError(StatusCodes.Status403Forbidden, [{ message: "Insufficient permissions to set ready state." }])
      .build();
  }

  const result = await region.createSnapshot(id, data, currentSession.user!.id);
  return oneOf(result).match(
    s => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "region_snapshot_created",
        summary: `Created region snapshot ${s.snapshotName}`,
        routePath: `/api/restricted/management/region/${id}`,
        httpMethod: "POST",
        statusCode: StatusCodes.Status201Created,
        entityType: "region_snapshot",
        entityId: s.snapshotId,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]">,
) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, [{ message: "No region found with given ID." }])
      .build();
  }

  const data = await tryParseJson<SwitchPatchBody>(request);
  if (!data) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid Payload." }])
      .build();
  }

  // Validate the body first.
  const validation = await validator.validate<SwitchPatchBody>(data, {
    properties: {
      isPublic: { type: "boolean" },
    },
    requiredProperties: ["isPublic"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const wasPublic = await unwrap(region.isRegionPublished(id));

  const result = await region.togglePublic(id, data.isPublic);
  return oneOf(result).match(
    s => {
      if (wasPublic !== s.isPublic) void invalidate();

      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "publish_state_changed",
        action: "region_publish_state_changed",
        summary: `Switch publication status for ID: ${id}`,
        routePath: `/api/restricted/management/region/${id}`,
        httpMethod: "PATCH",
        statusCode: StatusCodes.Status200Ok,
        entityType: "region",
        entityId: id,
        payload: data,
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build();
    },
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/region/[id]">,
) {
  const currentSession = await session.verify();
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid region ID" }])
      .build();
  }

  try {
    const isDeletable = await unwrap(region.isAllContentDeletableByContributor(id));

    // Content cannot be deleted by just a contributor
    if (!isDeletable && currentSession.user!.role !== "administrator_user") {
      return ApiResponseBuilder
        .createError(StatusCodes.Status403Forbidden, { message: "Insufficient permissions" })
        .build();
    }

    // Proceed with deletion
    const wasPublic = await unwrap(region.isRegionPublished(id));

    const result = await region.removeRegion(id);
    return oneOf(result).match(
      () => {
        if (wasPublic) void invalidate();

        void logActivity({
          actorUserId: currentSession.user!.id,
          actorRole: currentSession.user!.role,
          category: "write_operation",
          action: "region_deleted",
          summary: `Deleted region ${id}`,
          routePath: `/api/restricted/management/region/${id}`,
          httpMethod: "DELETE",
          statusCode: StatusCodes.Status200Ok,
          entityType: "region",
          entityId: id,
        });

        return ApiResponseBuilder.create(StatusCodes.Status200Ok)
          .withBody({ ok: true })
          .build();
      },
      e => ApiResponseBuilder.createFromFailure(e).build(),
    );
  } catch (e) {
    const err = e as unknown as UnwrappedException;
    return ApiResponseBuilder
      .createError(StatusCodes.Status500InternalServerError, { message: err.message })
      .build();
  }
}

type SwitchPatchBody = {
  isPublic: boolean;
}

type RequestBody = {
  snapshotName: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<{
    sequence: number;
    point: [number, number];
  }>;
  stations: Array<{
    address: string;
    point: [number, number];
  }>;
}
