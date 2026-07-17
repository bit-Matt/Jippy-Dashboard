import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type * as GeoJSON from "@/lib/db/postgis-extension/geojsonTypes";
import { stops } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";
import { invalidate } from "../routing-fast";

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const baseUrl = process.env.NOMINATIM_URL;
  if (!baseUrl) {
    return `${lat}, ${lon}`;
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return `${lat}, ${lon}`;
    }

    const data = await res.json() as { display_name?: string };
    return data.display_name ?? `${lat}, ${lon}`;
  } catch {
    return `${lat}, ${lon}`;
  }
}

async function getNextStopNumber(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`MAX(${stops.number})` })
    .from(stops);

  return (row?.max ?? 0) + 1;
}

function pointToTuple(point: GeoJSON.Point | null): [number, number] | null {
  if (!point?.coordinates) {
    return null;
  }

  const [lon, lat] = point.coordinates;
  return [lat, lon];
}

function tupleToPoint(tuple: [number, number]): GeoJSON.Point {
  const [lat, lon] = tuple;
  return {
    type: "Point",
    coordinates: [lon, lat],
  };
}

function mapStopRow(row: {
  id: string;
  number: number;
  address: string;
  pointGeometry: GeoJSON.Point | null;
  directionality: StopDirectionality | null;
  isPublic: boolean;
}): StopObject {
  return {
    id: row.id,
    number: row.number,
    address: row.address,
    point: pointToTuple(row.pointGeometry),
    directionality: row.directionality ?? "both",
    isPublic: row.isPublic,
  };
}

/**
 * Fetches all transit stops.
 */
export async function getAllStops(forPublic: boolean = true): Promise<Result<StopObject[]>> {
  try {
    const query = db
      .select({
        id: stops.id,
        number: stops.number,
        address: stops.address,
        pointGeometry: stops.point,
        directionality: stops.directionality,
        isPublic: stops.isPublic,
      })
      .from(stops);

    const rows = forPublic
      ? await query.where(eq(stops.isPublic, true))
      : await query;

    const result = rows.map(mapStopRow);
    return new Success(result);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch stops.", {}, error);
  }
}

/**
 * Creates a transit stop with auto-assigned or user-provided number and reverse-geocoded address.
 */
export async function createStop(payload: StopAddParameters, ownerId: string): Promise<Result<StopObject>> {
  try {
    const [lat, lon] = payload.point;
    const address = await reverseGeocode(lat, lon);
    const stopNumber = payload.number ?? await getNextStopNumber();

    const [newStop] = await db
      .insert(stops)
      .values({
        number: stopNumber,
        address,
        point: tupleToPoint(payload.point),
        directionality: payload.directionality ?? "both",
        isPublic: false,
        ownerId,
      })
      .returning({
        id: stops.id,
        number: stops.number,
        address: stops.address,
        pointGeometry: stops.point,
        directionality: stops.directionality,
        isPublic: stops.isPublic,
      });

    if (!newStop) {
      return new Failure(ErrorCodes.Fatal, "Failed to create stop.", { payload });
    }

    // Invalidate cache
    await invalidate();

    return new Success(mapStopRow(newStop));
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to create stop.", { payload }, error);
  }
}

/**
 * Updates a transit stop. Published stops are read-only and must be unpublished first.
 */
export async function updateStop(stopId: string, params: StopUpdateParameters): Promise<Result<StopObject>> {
  try {
    const [existing] = await db
      .select({
        id: stops.id,
        isPublic: stops.isPublic,
      })
      .from(stops)
      .where(eq(stops.id, stopId))
      .limit(1);

    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Stop not found.", { stopId });
    }

    if (existing.isPublic) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Published stops cannot be modified. Unpublish the stop first.",
        { stopId },
      );
    }

    const patch: {
      number?: number;
      address?: string;
      point?: GeoJSON.Point;
      directionality?: StopDirectionality;
    } = {};

    if (params.number !== undefined) {
      patch.number = params.number;
    }

    if (params.directionality !== undefined) {
      patch.directionality = params.directionality;
    }

    if (params.point !== undefined) {
      const [lat, lon] = params.point;
      patch.point = tupleToPoint(params.point);
      patch.address = await reverseGeocode(lat, lon);
    }

    if (Object.keys(patch).length === 0) {
      return new Failure(ErrorCodes.ValidationFailure, "No update fields provided.", { stopId });
    }

    const [updated] = await db
      .update(stops)
      .set(patch)
      .where(eq(stops.id, stopId))
      .returning({
        id: stops.id,
        number: stops.number,
        address: stops.address,
        pointGeometry: stops.point,
        directionality: stops.directionality,
        isPublic: stops.isPublic,
      });

    if (!updated) {
      return new Failure(ErrorCodes.ResourceNotFound, "Stop not found.", { stopId });
    }

    // Trigger cache invalidation upon updating the stop
    await invalidate();

    return new Success(mapStopRow(updated));
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to update stop.", { stopId, params }, error);
  }
}

/**
 * Deletes a transit stop.
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
    await invalidate();

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

    if (!stop) {
      return new Failure(ErrorCodes.ResourceNotFound, "Stop not found.", { stopId });
    }

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

export type StopDirectionality = "direction_to" | "direction_back" | "both";

export interface StopObject {
  id: string;
  number: number;
  address: string;
  point: [number, number] | null;
  directionality: StopDirectionality;
  isPublic: boolean;
}

export interface StopAddParameters {
  number?: number;
  point: [number, number];
  directionality?: StopDirectionality;
}

export interface StopUpdateParameters {
  number?: number;
  point?: [number, number];
  directionality?: StopDirectionality;
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}
