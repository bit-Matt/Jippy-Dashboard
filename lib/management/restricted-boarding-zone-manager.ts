import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type * as GeoJSON from "@/lib/db/postgis-extension/geojsonTypes";
import { restrictedBordingZone, routeRestrictedInBoardingZone } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";
import { encodePolyline } from "@/lib/routing/polyline";

export function lineStringToRbzPoints(lineString: GeoJSON.LineString | null, zoneId: string): RbzPointObject[] {
  if (!lineString?.coordinates) return [];
  return lineString.coordinates.map((pos, i) => ({
    id: `${zoneId}-${i + 1}`,
    sequence: i + 1,
    point: [pos[1], pos[0]] as [number, number],
  }));
}

export function pointsToLineString(points: Array<Omit<RbzPointObject, "id">>): GeoJSON.LineString {
  const sorted = [...points].sort((a, b) => a.sequence - b.sequence);
  return {
    type: "LineString",
    coordinates: sorted.map(p => [p.point[1], p.point[0]]),
  };
}

/**
 * Fetches all restricted boarding zones with their points and restricted routes.
 */
export async function getAllRestrictedBoardingZones(forPublic: boolean = true): Promise<Result<BaseRbzObject[] | RbzObject[]>> {
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

      return new Success(result satisfies BaseRbzObject[]);
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
      points: lineStringToRbzPoints(row.pointsGeometry, row.id),
      routeIds: row.routeIds ?? [],
    }));

    return new Success(result satisfies RbzObject[]);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch restricted boarding zones.", {}, error);
  }
}

/**
 * Creates a restricted boarding zone with its line points and optional route restrictions.
 */
export async function createRestrictedBoardingZone(payload: RbzAddParameters, ownerId: string): Promise<Result<RbzObject>> {
  try {
    const result = await db.transaction(async tx => {
      const lineString = pointsToLineString(payload.points);
      const sortedForPolyline = [...payload.points].sort((a, b) => a.sequence - b.sequence);
      const encodedPolyline = encodePolyline(sortedForPolyline.map(p => p.point));

      const [newZone] = await tx
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

      if (!newZone) {
        return tx.rollback();
      }

      let routeIds: string[] = [];
      if (payload.restrictionType === "specific" && payload.routeIds && payload.routeIds.length > 0) {
        const routeRows = await tx
          .insert(routeRestrictedInBoardingZone)
          .values(payload.routeIds.map((routeId) => ({
            restrictionZoneId: newZone.id,
            routeId,
          })))
          .returning({ routeId: routeRestrictedInBoardingZone.routeId });

        routeIds = routeRows.map((r) => r.routeId);
      }

      return {
        id: newZone.id,
        name: newZone.name,
        restrictionType: newZone.restrictionType,
        isPublic: newZone.isPublic,
        disallowedDirection: newZone.disallowedDirection,
        polyline: newZone.polyline,
        points: lineStringToRbzPoints(lineString, newZone.id),
        routeIds,
      } satisfies RbzObject;
    });

    return new Success(result);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to create restricted boarding zone.", { payload }, error);
  }
}

/**
 * Updates zone fields, points, and junction table entries.
 * Published zones are read-only and must be unpublished first.
 */
export async function updateRestrictedBoardingZone(zoneId: string, params: RbzUpdateParameters): Promise<Result<RbzObject>> {
  try {
    const [zone] = await db
      .select({ id: restrictedBordingZone.id, isPublic: restrictedBordingZone.isPublic })
      .from(restrictedBordingZone)
      .where(eq(restrictedBordingZone.id, zoneId))
      .limit(1);

    if (!zone) {
      return new Failure(ErrorCodes.ResourceNotFound, "Restricted boarding zone not found.", { zoneId });
    }

    if (zone.isPublic) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Published restricted boarding zones cannot be modified. Unpublish the zone first.",
        { zoneId },
      );
    }

    const updated = await db.transaction(async tx => {
      const zonePatch = {
        ...(params.name !== undefined && { name: params.name }),
        ...(params.restrictionType !== undefined && { restrictionType: params.restrictionType }),
        ...(params.disallowedDirection !== undefined && { disallowedDirection: params.disallowedDirection }),
      };

      let updatedZone: {
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

        Object.assign(zonePatch, {
          points: lineString,
          polyline: encodedPolyline,
        });
      }

      if (Object.keys(zonePatch).length > 0) {
        const [patched] = await tx
          .update(restrictedBordingZone)
          .set(zonePatch)
          .where(eq(restrictedBordingZone.id, zone.id))
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

        updatedZone = patched;
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
          .where(eq(restrictedBordingZone.id, zone.id))
          .limit(1);

        if (!existing) {
          return tx.rollback();
        }

        updatedZone = existing;
      }

      const points = lineStringToRbzPoints(updatedZone.points, updatedZone.id);

      if (updatedZone.restrictionType === "universal") {
        await tx.delete(routeRestrictedInBoardingZone)
          .where(eq(routeRestrictedInBoardingZone.restrictionZoneId, updatedZone.id));
      }

      let routeIds: string[];
      if (updatedZone.restrictionType === "specific" && Array.isArray(params.routeIds)) {
        await tx.delete(routeRestrictedInBoardingZone)
          .where(eq(routeRestrictedInBoardingZone.restrictionZoneId, updatedZone.id));

        if (params.routeIds.length > 0) {
          const routeRows = await tx
            .insert(routeRestrictedInBoardingZone)
            .values(params.routeIds.map((routeId) => ({
              restrictionZoneId: updatedZone.id,
              routeId,
            })))
            .returning({ routeId: routeRestrictedInBoardingZone.routeId });

          routeIds = routeRows.map((r) => r.routeId);
        } else {
          routeIds = [];
        }
      } else if (updatedZone.restrictionType === "universal") {
        routeIds = [];
      } else {
        const existing = await tx
          .select({ routeId: routeRestrictedInBoardingZone.routeId })
          .from(routeRestrictedInBoardingZone)
          .where(eq(routeRestrictedInBoardingZone.restrictionZoneId, updatedZone.id));

        routeIds = existing.map((r) => r.routeId);
      }

      return {
        id: updatedZone.id,
        name: updatedZone.name,
        restrictionType: updatedZone.restrictionType,
        isPublic: updatedZone.isPublic,
        disallowedDirection: updatedZone.disallowedDirection,
        polyline: updatedZone.polyline,
        points,
        routeIds,
      } satisfies RbzObject;
    });

    return new Success(updated);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to update restricted boarding zone.", { zoneId, params }, error);
  }
}

/**
 * Deletes a restricted boarding zone and all of its associated data (cascade).
 */
export async function removeRestrictedBoardingZone(zoneId: string): Promise<Result<null>> {
  try {
    const [selectedZone] = await db
      .select({ id: restrictedBordingZone.id })
      .from(restrictedBordingZone)
      .where(eq(restrictedBordingZone.id, zoneId))
      .limit(1);

    if (!selectedZone) {
      return new Failure(ErrorCodes.ResourceNotFound, "Restricted boarding zone not found.", { zoneId });
    }

    await db.delete(restrictedBordingZone).where(eq(restrictedBordingZone.id, selectedZone.id));
    return new Success(null);
  } catch (error) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to delete restricted boarding zone due to an exception.",
      { zoneId },
      error,
    );
  }
}

/**
 * Checks whether a restricted boarding zone can be modified (i.e. is not published).
 */
export async function isRestrictedBoardingZoneModifiable(zoneId: string): Promise<Result<boolean>> {
  try {
    const [zone] = await db
      .select({ isPublic: restrictedBordingZone.isPublic })
      .from(restrictedBordingZone)
      .where(eq(restrictedBordingZone.id, zoneId))
      .limit(1);

    return new Success(!zone.isPublic);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to determine if the restricted boarding zone is modifiable.", { zoneId }, e);
  }
}

/**
 * Toggles restricted boarding zone visibility in public endpoints.
 */
export async function toggleRestrictedBoardingZonePublic(zoneId: string, state: boolean): Promise<Result<PublicToggleResult>> {
  try {
    const [update] = await db
      .update(restrictedBordingZone)
      .set({ isPublic: state })
      .where(eq(restrictedBordingZone.id, zoneId))
      .returning({ id: restrictedBordingZone.id, isPublic: restrictedBordingZone.isPublic });

    if (!update) {
      return new Failure(ErrorCodes.ResourceNotFound, "Restricted boarding zone not found.", { zoneId, state });
    }

    return new Success({
      id: update.id,
      isPublic: update.isPublic,
    });
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Unable to toggle public visibility.", { zoneId, state }, error);
  }
}

export interface RbzPointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export type DisallowedDirection = "direction_to" | "direction_back" | "both";

export interface BaseRbzObject {
  id: string;
  name: string;
  restrictionType: "universal" | "specific";
  disallowedDirection: DisallowedDirection;
  polyline: string;
  routeIds: string[];
}

export type RbzObject = BaseRbzObject & { isPublic: boolean; points: RbzPointObject[] }

export interface RbzAddParameters {
  name: string;
  restrictionType: "universal" | "specific";
  disallowedDirection?: DisallowedDirection;
  points: Array<Omit<RbzPointObject, "id">>;
  routeIds?: string[];
}

export interface RbzUpdateParameters {
  name?: string;
  restrictionType?: "universal" | "specific";
  disallowedDirection?: DisallowedDirection;
  points?: Array<Omit<RbzPointObject, "id">>;
  routeIds?: string[];
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}
