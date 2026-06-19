import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type * as GeoJSON from "@/lib/db/postgis-extension/geojsonTypes";
import { restrictedBordingZone, routeRestrictedInBoardingZone } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";
import { encodePolyline } from "@/lib/routing/polyline";

export function lineStringToStopPoints(lineString: GeoJSON.LineString | null, stopId: string): StopPointObject[] {
  if (!lineString?.coordinates) return [];
  return lineString.coordinates.map((pos, i) => ({
    id: `${stopId}-${i + 1}`,
    sequence: i + 1,
    point: [pos[1], pos[0]] as [number, number],
  }));
}

export function pointsToLineString(points: Array<Omit<StopPointObject, "id">>): GeoJSON.LineString {
  const sorted = [...points].sort((a, b) => a.sequence - b.sequence);
  return {
    type: "LineString",
    coordinates: sorted.map(p => [p.point[1], p.point[0]]),
  };
}

/**
 * Fetches all stops with their points and restricted routes.
 */
export async function getAllStops(forPublic: boolean = true): Promise<Result<BaseStopObject[] | StopObject[]>> {
  try {
    const routeIdsAggregation = sql<string[]>`
      COALESCE(
        json_agg(DISTINCT ${routeRestrictedInBoardingZone.routeId}) FILTER (WHERE ${routeRestrictedInBoardingZone.routeId} IS NOT NULL),
        '[]'::json
      )
    `;

    if (forPublic) {
      const result = await db
        .select({
          id: restrictedBordingZone.id,
          name: restrictedBordingZone.name,
          restrictionType: restrictedBordingZone.restrictionType,
          disallowedDirection: restrictedBordingZone.disallowedDirection,
          polyline: restrictedBordingZone.polyline,
          routeIds: routeIdsAggregation,
        })
        .from(restrictedBordingZone)
        .leftJoin(
          routeRestrictedInBoardingZone,
          eq(routeRestrictedInBoardingZone.restrictionZoneId, restrictedBordingZone.id),
        )
        .where(eq(restrictedBordingZone.isPublic, true))
        .groupBy(
          restrictedBordingZone.id,
          restrictedBordingZone.name,
          restrictedBordingZone.restrictionType,
          restrictedBordingZone.disallowedDirection,
          restrictedBordingZone.polyline,
          restrictedBordingZone.isPublic,
        );

      return new Success(result satisfies BaseStopObject[]);
    }

    const rows = await db
      .select({
        id: restrictedBordingZone.id,
        name: restrictedBordingZone.name,
        restrictionType: restrictedBordingZone.restrictionType,
        disallowedDirection: restrictedBordingZone.disallowedDirection,
        polyline: restrictedBordingZone.polyline,
        isPublic: restrictedBordingZone.isPublic,
        pointsGeometry: restrictedBordingZone.points,
        routeIds: routeIdsAggregation,
      })
      .from(restrictedBordingZone)
      .leftJoin(
        routeRestrictedInBoardingZone,
        eq(routeRestrictedInBoardingZone.restrictionZoneId, restrictedBordingZone.id),
      )
      .groupBy(
        restrictedBordingZone.id,
        restrictedBordingZone.name,
        restrictedBordingZone.restrictionType,
        restrictedBordingZone.disallowedDirection,
        restrictedBordingZone.polyline,
        restrictedBordingZone.isPublic,
        restrictedBordingZone.points,
      );

    const result = rows.map(row => ({
      id: row.id,
      name: row.name,
      restrictionType: row.restrictionType,
      disallowedDirection: row.disallowedDirection,
      polyline: row.polyline,
      isPublic: row.isPublic,
      points: lineStringToStopPoints(row.pointsGeometry, row.id),
      routeIds: row.routeIds ?? [],
    }));

    return new Success(result satisfies StopObject[]);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch stops.", {}, error);
  }
}

/**
 * Creates a stop with its line points and optional route restrictions.
 */
export async function createStop(payload: StopAddParameters, ownerId: string): Promise<Result<StopObject>> {
  try {
    const result = await db.transaction(async tx => {
      const lineString = pointsToLineString(payload.points);
      const sortedForPolyline = [...payload.points].sort((a, b) => a.sequence - b.sequence);
      const encodedPolyline = encodePolyline(sortedForPolyline.map(p => p.point));

      const [newStop] = await tx
        .insert(restrictedBordingZone)
        .values({
          name: payload.name,
          restrictionType: payload.restrictionType,
          disallowedDirection: payload.disallowedDirection ?? "both",
          points: lineString,
          polyline: encodedPolyline,
          isPublic: false,
          ownerId,
        })
        .returning({
          id: restrictedBordingZone.id,
          name: restrictedBordingZone.name,
          restrictionType: restrictedBordingZone.restrictionType,
          isPublic: restrictedBordingZone.isPublic,
          disallowedDirection: restrictedBordingZone.disallowedDirection,
          polyline: restrictedBordingZone.polyline,
        });

      if (!newStop) {
        return tx.rollback();
      }

      let routeIds: string[] = [];
      if (payload.restrictionType === "specific" && payload.routeIds && payload.routeIds.length > 0) {
        const rows = await tx
          .insert(routeRestrictedInBoardingZone)
          .values(payload.routeIds.map((routeId) => ({
            restrictionZoneId: newStop.id,
            routeId,
          })))
          .returning({ routeId: routeRestrictedInBoardingZone.routeId });

        routeIds = rows.map((r) => r.routeId);
      }

      return {
        id: newStop.id,
        name: newStop.name,
        restrictionType: newStop.restrictionType,
        isPublic: newStop.isPublic,
        disallowedDirection: newStop.disallowedDirection,
        polyline: newStop.polyline,
        points: lineStringToStopPoints(lineString, newStop.id),
        routeIds,
      } satisfies StopObject;
    });

    return new Success(result);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to create stop.", { payload }, error);
  }
}

/**
 * Updates stop fields, points, and junction table entries.
 * Published stops are read-only and must be unpublished first.
 */
export async function updateStop(stopId: string, params: StopUpdateParameters): Promise<Result<StopObject>> {
  try {
    const [stop] = await db
      .select({ id: restrictedBordingZone.id, isPublic: restrictedBordingZone.isPublic })
      .from(restrictedBordingZone)
      .where(eq(restrictedBordingZone.id, stopId))
      .limit(1);

    if (!stop) {
      return new Failure(ErrorCodes.ResourceNotFound, "Stop not found.", { stopId });
    }

    if (stop.isPublic) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Published stops cannot be modified. Unpublish the stop first.",
        { stopId },
      );
    }

    const updated = await db.transaction(async tx => {
      const stopPatch = {
        ...(params.name !== undefined && { name: params.name }),
        ...(params.restrictionType !== undefined && { restrictionType: params.restrictionType }),
        ...(params.disallowedDirection !== undefined && { disallowedDirection: params.disallowedDirection }),
      };

      let updatedStop: {
        id: string;
        name: string;
        restrictionType: "universal" | "specific";
        isPublic: boolean;
        disallowedDirection: DisallowedDirection;
        polyline: string;
        points: GeoJSON.LineString | null;
      };

      if (Array.isArray(params.points)) {
        const lineString = params.points.length === 0 ? null : pointsToLineString(params.points);
        const sortedForPolyline = [...params.points].sort((a, b) => a.sequence - b.sequence);
        const encodedPolyline = params.points.length === 0
          ? ""
          : encodePolyline(sortedForPolyline.map(p => p.point));

        Object.assign(stopPatch, {
          points: lineString,
          polyline: encodedPolyline,
        });
      }

      if (Object.keys(stopPatch).length > 0) {
        const [patched] = await tx
          .update(restrictedBordingZone)
          .set(stopPatch)
          .where(eq(restrictedBordingZone.id, stop.id))
          .returning({
            id: restrictedBordingZone.id,
            name: restrictedBordingZone.name,
            restrictionType: restrictedBordingZone.restrictionType,
            isPublic: restrictedBordingZone.isPublic,
            disallowedDirection: restrictedBordingZone.disallowedDirection,
            polyline: restrictedBordingZone.polyline,
            points: restrictedBordingZone.points,
          });

        if (!patched) {
          return tx.rollback();
        }

        updatedStop = patched;
      } else {
        const [existing] = await tx
          .select({
            id: restrictedBordingZone.id,
            name: restrictedBordingZone.name,
            restrictionType: restrictedBordingZone.restrictionType,
            isPublic: restrictedBordingZone.isPublic,
            disallowedDirection: restrictedBordingZone.disallowedDirection,
            polyline: restrictedBordingZone.polyline,
            points: restrictedBordingZone.points,
          })
          .from(restrictedBordingZone)
          .where(eq(restrictedBordingZone.id, stop.id))
          .limit(1);

        if (!existing) {
          return tx.rollback();
        }

        updatedStop = existing;
      }

      const points = lineStringToStopPoints(updatedStop.points, updatedStop.id);

      if (updatedStop.restrictionType === "universal") {
        await tx.delete(routeRestrictedInBoardingZone)
          .where(eq(routeRestrictedInBoardingZone.restrictionZoneId, updatedStop.id));
      }

      let routeIds: string[];
      if (updatedStop.restrictionType === "specific" && Array.isArray(params.routeIds)) {
        await tx.delete(routeRestrictedInBoardingZone)
          .where(eq(routeRestrictedInBoardingZone.restrictionZoneId, updatedStop.id));

        if (params.routeIds.length > 0) {
          const rows = await tx
            .insert(routeRestrictedInBoardingZone)
            .values(params.routeIds.map((routeId) => ({
              restrictionZoneId: updatedStop.id,
              routeId,
            })))
            .returning({ routeId: routeRestrictedInBoardingZone.routeId });

          routeIds = rows.map((r) => r.routeId);
        } else {
          routeIds = [];
        }
      } else if (updatedStop.restrictionType === "universal") {
        routeIds = [];
      } else {
        const existing = await tx
          .select({ routeId: routeRestrictedInBoardingZone.routeId })
          .from(routeRestrictedInBoardingZone)
          .where(eq(routeRestrictedInBoardingZone.restrictionZoneId, updatedStop.id));

        routeIds = existing.map((r) => r.routeId);
      }

      return {
        id: updatedStop.id,
        name: updatedStop.name,
        restrictionType: updatedStop.restrictionType,
        isPublic: updatedStop.isPublic,
        disallowedDirection: updatedStop.disallowedDirection,
        polyline: updatedStop.polyline,
        points,
        routeIds,
      } satisfies StopObject;
    });

    return new Success(updated);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to update stop.", { stopId, params }, error);
  }
}

/**
 * Deletes a stop and all of its associated data (cascade).
 */
export async function removeStop(stopId: string): Promise<Result<null>> {
  try {
    const [selectedStop] = await db
      .select({ id: restrictedBordingZone.id })
      .from(restrictedBordingZone)
      .where(eq(restrictedBordingZone.id, stopId))
      .limit(1);

    if (!selectedStop) {
      return new Failure(ErrorCodes.ResourceNotFound, "Stop not found.", { stopId });
    }

    await db.delete(restrictedBordingZone).where(eq(restrictedBordingZone.id, selectedStop.id));
    return new Success(null);
  } catch (error) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to delete stop due to an exception.",
      { stopId },
      error,
    );
  }
}

/**
 * Checks whether a stop can be modified (i.e. is not published).
 */
export async function isStopModifiable(stopId: string): Promise<Result<boolean>> {
  try {
    const [stop] = await db
      .select({ isPublic: restrictedBordingZone.isPublic })
      .from(restrictedBordingZone)
      .where(eq(restrictedBordingZone.id, stopId))
      .limit(1);

    return new Success(!stop.isPublic);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to determine if the stop is modifiable.", { stopId }, e);
  }
}

/**
 * Toggles stop visibility in public endpoints.
 */
export async function toggleStopPublic(stopId: string, state: boolean): Promise<Result<PublicToggleResult>> {
  try {
    const [update] = await db
      .update(restrictedBordingZone)
      .set({ isPublic: state })
      .where(eq(restrictedBordingZone.id, stopId))
      .returning({ id: restrictedBordingZone.id, isPublic: restrictedBordingZone.isPublic });

    if (!update) {
      return new Failure(ErrorCodes.ResourceNotFound, "Stop not found.", { stopId, state });
    }

    return new Success({
      id: update.id,
      isPublic: update.isPublic,
    });
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Unable to toggle public visibility.", { stopId, state }, error);
  }
}

export interface StopPointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export type DisallowedDirection = "direction_to" | "direction_back" | "both";

export interface BaseStopObject {
  id: string;
  name: string;
  restrictionType: "universal" | "specific";
  disallowedDirection: DisallowedDirection;
  polyline: string;
  routeIds: string[];
}

export type StopObject = BaseStopObject & { isPublic: boolean; points: StopPointObject[] }

export interface StopAddParameters {
  name: string;
  restrictionType: "universal" | "specific";
  disallowedDirection?: DisallowedDirection;
  points: Array<Omit<StopPointObject, "id">>;
  routeIds?: string[];
}

export interface StopUpdateParameters {
  name?: string;
  restrictionType?: "universal" | "specific";
  disallowedDirection?: DisallowedDirection;
  points?: Array<Omit<StopPointObject, "id">>;
  routeIds?: string[];
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}
