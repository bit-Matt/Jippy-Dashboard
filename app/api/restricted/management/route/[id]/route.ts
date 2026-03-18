import type { NextRequest } from "next/server";

import { ResponseComposer, StatusCodes } from "@/lib/http";
import * as route from "@/lib/management/route-manager";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { getRoutePolyline } from "@/lib/osm/valhalla";
import { utils, validator } from "@/lib/validator";
import { region } from "@/lib/db/schema";

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]">,
) {
  const { id } = await params;

  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid route ID" }])
      .orchestrate();
  }

  const data = await tryParseJson<PatchRequestBody>(request);
  if (!data) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid payload." }])
      .orchestrate();
  }

  const hasAnyPatchField =
    data.routeNumber !== undefined
    || data.routeName !== undefined
    || data.routeColor !== undefined
    || data.routeDetails !== undefined
    || data.points !== undefined;
  if (!hasAnyPatchField) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "No update fields provided." }])
      .orchestrate();
  }

  const validation = await validator.validate<PatchRequestBody>(data, {
    properties: {
      routeNumber: { type: "string", formatter: "non-empty-string" },
      routeName: { type: "string", formatter: "non-empty-string" },
      routeColor: { type: "string", formatter: "hex-color" },
      routeDetails: { type: "string", formatter: "non-empty-string" },
      points: {
        type: "object",
        formatterFn: async (values) => {
          // Pass if not defined.
          if (!values) return { ok: true };

          if (!Array.isArray(values.goingTo) || !Array.isArray(values.goingBack)) {
            return { ok: false, error: "Invalid points." };
          }

          if (values.goingTo.length < 2 || values.goingBack.length < 2) {
            return { ok: false, error: "Some of your points does not meet the >=2 point criteria." };
          }

          for (const point of [...values.goingTo, ...values.goingBack]) {
            if (!utils.isExisty(point.sequence) || !utils.isFinite(point.sequence)) {
              return { ok: false, error: "Invalid sequence." };
            }

            if (!utils.isExisty(point.address) || !utils.isNonEmpty(point.address)) {
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
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [validation.errors!])
      .orchestrate();
  }

  const patchPayload: route.UpdateRouteParameters = { ...data };

  if (data.points) {
    const [polylineGoingTo, polylineGoingBack] = await Promise.all([
      getRoutePolyline(data.points.goingTo),
      getRoutePolyline(data.points.goingBack),
    ]);

    patchPayload.polylineGoingTo = polylineGoingTo;
    patchPayload.polylineGoingBack = polylineGoingBack;
  }

  const result = await route.updateRoute(id, patchPayload);
  return oneOf(result).match(
    success => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody(success)
      .orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext<"/api/restricted/management/route/[id]">,
) {
  const { id } = await params;

  // Invalid ID format.
  if (!utils.isUuid(id)) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, [{ message: "Invalid route ID" }])
      .orchestrate();
  }

  const result = await route.removeRoute(id);
  return oneOf(result).match(
    () => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({ ok: true })
      .orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type PatchRequestBody = {
  routeNumber?: string;
  routeName?: string;
  routeColor?: string;
  routeDetails?: string;
  points?: {
    goingTo: Array<{
      sequence: number;
      address: string;
      point: [number, number];
    }>;
    goingBack: Array<{
      sequence: number;
      address: string;
      point: [number, number];
    }>;
  }
}
