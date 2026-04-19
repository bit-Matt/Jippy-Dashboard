import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { stops, stopPoints, stopRoutes, stopVehicleTypes } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";
import { encodePolyline } from "@/lib/routing/polyline";

/**
 * Fetches all stops with their points, restricted routes, and vehicle types.
 */
export async function getAllStops(forPublic: boolean = true): Promise<Result<BaseStopObject[] | StopObject[]>> {
  try {
    const routeIdsAggregation = sql<string[]>`
      COALESCE(
        json_agg(DISTINCT ${stopRoutes.routeId}) FILTER (WHERE ${stopRoutes.routeId} IS NOT NULL),
        '[]'::json
      )
    `;

    const vehicleTypeIdsAggregation = sql<string[]>`
      COALESCE(
        json_agg(DISTINCT ${stopVehicleTypes.vehicleTypeId}) FILTER (WHERE ${stopVehicleTypes.vehicleTypeId} IS NOT NULL),
        '[]'::json
      )
    `;

    if (forPublic) {
      const result = await db
        .select({
          id: stops.id,
          name: stops.name,
          restrictionType: stops.restrictionType,
          disallowedDirection: stops.disallowedDirection,
          polyline: stops.polyline,
          routeIds: routeIdsAggregation,
          vehicleTypeIds: vehicleTypeIdsAggregation,
        })
        .from(stops)
        .leftJoin(stopRoutes, eq(stopRoutes.stopId, stops.id))
        .leftJoin(stopVehicleTypes, eq(stopVehicleTypes.stopId, stops.id))
        .where(eq(stops.isPublic, true))
        .groupBy(
          stops.id,
          stops.name,
          stops.restrictionType,
          stops.disallowedDirection,
          stops.polyline,
          stops.isPublic,
        );

      return new Success(result satisfies BaseStopObject[]);
    }

    const pointsAggregation = sql<StopPointObject[]>`
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'id', ${stopPoints.id},
            'sequence', ${stopPoints.sequenceNumber},
            'point', json_build_array(
              ST_Y(${stopPoints.point}),
              ST_X(${stopPoints.point})
            )
          )
        ) FILTER (WHERE ${stopPoints.id} IS NOT NULL),
        '[]'::json
      )
    `;

    const result = await db
      .select({
        id: stops.id,
        name: stops.name,
        restrictionType: stops.restrictionType,
        disallowedDirection: stops.disallowedDirection,
        polyline: stops.polyline,
        isPublic: stops.isPublic,
        points: pointsAggregation,
        routeIds: routeIdsAggregation,
        vehicleTypeIds: vehicleTypeIdsAggregation,
      })
      .from(stops)
      .leftJoin(stopPoints, eq(stopPoints.stopId, stops.id))
      .leftJoin(stopRoutes, eq(stopRoutes.stopId, stops.id))
      .leftJoin(stopVehicleTypes, eq(stopVehicleTypes.stopId, stops.id))
      .groupBy(
        stops.id,
        stops.name,
        stops.restrictionType,
        stops.disallowedDirection,
        stops.polyline,
        stops.isPublic,
      );

    return new Success(result satisfies StopObject[]);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch stops.", {}, error);
  }
}

/**
 * Creates a stop with its line points and optional route/vehicle-type restrictions.
 */
export async function createStop(payload: StopAddParameters, ownerId: string): Promise<Result<StopObject>> {
  try {
    const result = await db.transaction(async tx => {
      const [newStop] = await tx
        .insert(stops)
        .values({
          name: payload.name,
          restrictionType: payload.restrictionType,
          disallowedDirection: payload.disallowedDirection ?? "both",
          isPublic: false,
          ownerId,
        })
        .returning({
          id: stops.id,
          name: stops.name,
          restrictionType: stops.restrictionType,
          isPublic: stops.isPublic,
          disallowedDirection: stops.disallowedDirection,
        });

      if (!newStop) {
        return tx.rollback();
      }

      const pointRows = await tx
        .insert(stopPoints)
        .values(payload.points.map((p) => ({
          stopId: newStop.id,
          sequenceNumber: p.sequence,
          point: [p.point[1], p.point[0]] as [number, number],
        })))
        .returning({
          id: stopPoints.id,
          sequence: stopPoints.sequenceNumber,
          point: stopPoints.point,
        });

      const sortedForPolyline = [...pointRows].sort((a, b) => a.sequence - b.sequence);
      const encodedPolyline = encodePolyline(sortedForPolyline.map(row => [row.point[1], row.point[0]] as [number, number]));
      await tx.update(stops).set({ polyline: encodedPolyline }).where(eq(stops.id, newStop.id));

      let routeIds: string[] = [];
      if (payload.restrictionType === "specific" && payload.routeIds && payload.routeIds.length > 0) {
        const rows = await tx
          .insert(stopRoutes)
          .values(payload.routeIds.map((routeId) => ({
            stopId: newStop.id,
            routeId,
          })))
          .returning({ routeId: stopRoutes.routeId });

        routeIds = rows.map((r) => r.routeId);
      }

      let vehicleTypeIds: string[] = [];
      if (payload.restrictionType === "specific" && payload.vehicleTypeIds && payload.vehicleTypeIds.length > 0) {
        const rows = await tx
          .insert(stopVehicleTypes)
          .values(payload.vehicleTypeIds.map((vehicleTypeId) => ({
            stopId: newStop.id,
            vehicleTypeId,
          })))
          .returning({ vehicleTypeId: stopVehicleTypes.vehicleTypeId });

        vehicleTypeIds = rows.map((r) => r.vehicleTypeId);
      }

      return {
        id: newStop.id,
        name: newStop.name,
        restrictionType: newStop.restrictionType,
        isPublic: newStop.isPublic,
        disallowedDirection: newStop.disallowedDirection,
        polyline: encodedPolyline,
        points: pointRows.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          point: [row.point[1], row.point[0]] as [number, number],
        })),
        routeIds,
        vehicleTypeIds,
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
      .select({ id: stops.id, isPublic: stops.isPublic })
      .from(stops)
      .where(eq(stops.id, stopId))
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
      };

      if (Object.keys(stopPatch).length > 0) {
        const [patched] = await tx
          .update(stops)
          .set(stopPatch)
          .where(eq(stops.id, stop.id))
          .returning({
            id: stops.id,
            name: stops.name,
            restrictionType: stops.restrictionType,
            isPublic: stops.isPublic,
            disallowedDirection: stops.disallowedDirection,
            polyline: stops.polyline,
          });

        if (!patched) {
          return tx.rollback();
        }

        updatedStop = patched;
      } else {
        const [existing] = await tx
          .select({
            id: stops.id,
            name: stops.name,
            restrictionType: stops.restrictionType,
            isPublic: stops.isPublic,
            disallowedDirection: stops.disallowedDirection,
            polyline: stops.polyline,
          })
          .from(stops)
          .where(eq(stops.id, stop.id))
          .limit(1);

        if (!existing) {
          return tx.rollback();
        }

        updatedStop = existing;
      }

      // Replace points if provided
      let points: StopPointObject[];
      let currentPolyline = updatedStop.polyline;
      if (Array.isArray(params.points)) {
        await tx.delete(stopPoints).where(eq(stopPoints.stopId, updatedStop.id));

        if (params.points.length === 0) {
          points = [];
          currentPolyline = "";
          await tx.update(stops).set({ polyline: "" }).where(eq(stops.id, updatedStop.id));
        } else {
          const pointRows = await tx
            .insert(stopPoints)
            .values(params.points.map((p) => ({
              stopId: updatedStop.id,
              sequenceNumber: p.sequence,
              point: [p.point[1], p.point[0]] as [number, number],
            })))
            .returning({
              id: stopPoints.id,
              sequence: stopPoints.sequenceNumber,
              point: stopPoints.point,
            });

          points = pointRows.map((row) => ({
            id: row.id,
            sequence: row.sequence,
            point: [row.point[1], row.point[0]] as [number, number],
          }));

          const sortedForPolyline = [...points].sort((a, b) => a.sequence - b.sequence);
          currentPolyline = encodePolyline(sortedForPolyline.map(p => p.point));
          await tx.update(stops).set({ polyline: currentPolyline }).where(eq(stops.id, updatedStop.id));
        }
      } else {
        const existingPoints = await tx
          .select({
            id: stopPoints.id,
            sequence: stopPoints.sequenceNumber,
            point: stopPoints.point,
          })
          .from(stopPoints)
          .where(eq(stopPoints.stopId, updatedStop.id));

        points = existingPoints.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          point: [row.point[1], row.point[0]] as [number, number],
        }));
      }

      // If switching to universal, clear junction tables
      if (updatedStop.restrictionType === "universal") {
        await tx.delete(stopRoutes).where(eq(stopRoutes.stopId, updatedStop.id));
        await tx.delete(stopVehicleTypes).where(eq(stopVehicleTypes.stopId, updatedStop.id));
      }

      // Replace route IDs if provided and type is specific
      let routeIds: string[];
      if (updatedStop.restrictionType === "specific" && Array.isArray(params.routeIds)) {
        await tx.delete(stopRoutes).where(eq(stopRoutes.stopId, updatedStop.id));

        if (params.routeIds.length > 0) {
          const rows = await tx
            .insert(stopRoutes)
            .values(params.routeIds.map((routeId) => ({
              stopId: updatedStop.id,
              routeId,
            })))
            .returning({ routeId: stopRoutes.routeId });

          routeIds = rows.map((r) => r.routeId);
        } else {
          routeIds = [];
        }
      } else if (updatedStop.restrictionType === "universal") {
        routeIds = [];
      } else {
        const existing = await tx
          .select({ routeId: stopRoutes.routeId })
          .from(stopRoutes)
          .where(eq(stopRoutes.stopId, updatedStop.id));

        routeIds = existing.map((r) => r.routeId);
      }

      // Replace vehicle type IDs if provided and type is specific
      let vehicleTypeIds: string[];
      if (updatedStop.restrictionType === "specific" && Array.isArray(params.vehicleTypeIds)) {
        await tx.delete(stopVehicleTypes).where(eq(stopVehicleTypes.stopId, updatedStop.id));

        if (params.vehicleTypeIds.length > 0) {
          const rows = await tx
            .insert(stopVehicleTypes)
            .values(params.vehicleTypeIds.map((vehicleTypeId) => ({
              stopId: updatedStop.id,
              vehicleTypeId,
            })))
            .returning({ vehicleTypeId: stopVehicleTypes.vehicleTypeId });

          vehicleTypeIds = rows.map((r) => r.vehicleTypeId);
        } else {
          vehicleTypeIds = [];
        }
      } else if (updatedStop.restrictionType === "universal") {
        vehicleTypeIds = [];
      } else {
        const existing = await tx
          .select({ vehicleTypeId: stopVehicleTypes.vehicleTypeId })
          .from(stopVehicleTypes)
          .where(eq(stopVehicleTypes.stopId, updatedStop.id));

        vehicleTypeIds = existing.map((r) => r.vehicleTypeId);
      }

      return {
        id: updatedStop.id,
        name: updatedStop.name,
        restrictionType: updatedStop.restrictionType,
        isPublic: updatedStop.isPublic,
        disallowedDirection: updatedStop.disallowedDirection,
        polyline: currentPolyline,
        points,
        routeIds,
        vehicleTypeIds,
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
      .select({ id: stops.id })
      .from(stops)
      .where(eq(stops.id, stopId))
      .limit(1);

    if (!selectedStop) {
      return new Failure(ErrorCodes.ResourceNotFound, "Stop not found.", { stopId });
    }

    await db.delete(stops).where(eq(stops.id, selectedStop.id));
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
      .select({ isPublic: stops.isPublic })
      .from(stops)
      .where(eq(stops.id, stopId))
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
      .update(stops)
      .set({ isPublic: state })
      .where(eq(stops.id, stopId))
      .returning({ id: stops.id, isPublic: stops.isPublic });

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
  vehicleTypeIds: string[];
}

export type StopObject = BaseStopObject & { isPublic: boolean; points: StopPointObject[] }

export interface StopAddParameters {
  name: string;
  restrictionType: "universal" | "specific";
  disallowedDirection?: DisallowedDirection;
  points: Array<Omit<StopPointObject, "id">>;
  routeIds?: string[];
  vehicleTypeIds?: string[];
}

export interface StopUpdateParameters {
  name?: string;
  restrictionType?: "universal" | "specific";
  disallowedDirection?: DisallowedDirection;
  points?: Array<Omit<StopPointObject, "id">>;
  routeIds?: string[];
  vehicleTypeIds?: string[];
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}
