"use server";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { routes, routeSequences } from "@/lib/db/schema";
import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";

/**
 * Fetches all routes and their ordered sequence points.
 *
 * Queries the `routes` table and LEFT-joins `routeSequences` so routes are returned
 * even if they have zero points. The flat join result is then grouped into an
 * array of `RouteObject`, each containing its `points` list sorted by sequence.
 *
 * @remarks
 * - The DB point is assumed to be stored as `[lng, lat]`.
 * - The API response maps it to `[lat, lng]` via `[sequencePoints[1], sequencePoints[0]]`.
 *
 * @returns {Promise<Failure<string> | Success<RouteObject[]>>}
 *   A discriminated result:
 *   - `Success<RouteObject[]>` containing all routes with their points.
 *   - `Failure(FailureCodes.Fatal, "Failed to fetch routes")` on unexpected/database errors.
 */
export async function getAllRoutes(): Promise<Failure<string> | Success<RouteObject[]>> {
  try {
    const rows = await db
      .select({
        // Route Fields
        routeId: routes.id,
        routeNumber: routes.routeNumber,
        routeName: routes.routeName,
        routeColor: routes.routeColor,

        // Sequence Fields
        pointId: routeSequences.id,
        sequence: routeSequences.sequenceNumber,
        address: routeSequences.address,
        sequencePoints: routeSequences.point,
      })
      .from(routes)
      .leftJoin(routeSequences, eq(routes.id, routeSequences.routeId))
      .orderBy(asc(routes.routeNumber), asc(routeSequences.sequenceNumber));

    // Transform flat rows
    const result = rows.reduce((acc, row) => {
      let route = acc.find((r) => r.id === row.routeId);

      if (!route) {
        route = {
          id: row.routeId,
          routeNumber: row.routeNumber,
          routeName: row.routeName,
          routeColor: row.routeColor,
          points: [],
        };
        acc.push(route);
      }

      if (row.pointId) {
        route.points.push({
          id: row.pointId,
          sequence: row.sequence!,
          address: row.address!,
          point: [row.sequencePoints![1], row.sequencePoints![0]] as [number, number],
        });
      }

      return acc;
    }, [] as Array<RouteObject>);

    return new Success(result);
  } catch {
    return new Failure(FailureCodes.Fatal, "Failed to fetch routes");
  }
}

/**
 * Creates a new route and its ordered sequence of points atomically.
 *
 * Inserts the route record first, then inserts one route-sequence row per point
 * within the same database transaction. If any insert step fails, the transaction
 * is rolled back and no partial data should be persisted.
 *
 * Notes:
 * - Points are persisted in the database as `[lng, lat]`.
 * - Returned points are mapped back as `[lat, lng]` for the API response.
 *
 * @param {AddRouteParameters} params
 *   Input payload used to create the route and its route-sequence points.
 * @param {string} params.routeNumber
 *   Human-readable/unique-ish route identifier (e.g., "42A").
 * @param {string} params.routeName
 *   Display name of the route.
 * @param {string} params.routeColor
 *   Route color (typically a CSS color string such as `#RRGGBB`).
 * @param {Array<{sequence:number,lat:number,lng:number,address:string}>} params.points
 *   Ordered list of points to associate with this route.
 *   `sequence` is stored as `sequenceNumber` in the DB.
 *   Coordinates are provided as `lat`/`lng` but stored as `[lng, lat]`.
 *
 * @returns {Promise<RouteObject>}
 *   Resolves with the created route and its created points. Each returned `point`
 *   is a `[lat, lng]` tuple.
 *
 * @throws {unknown}
 *   May throw if the underlying database operation fails or the transaction is aborted.
 */
export async function addRoute(params: AddRouteParameters): Promise<RouteObject> {
  return db.transaction(async tx => {
    // Create the route first
    const [route] = await tx
      .insert(routes)
      .values({
        routeName: params.routeName,
        routeNumber: params.routeNumber,
        routeColor: params.routeColor,
      })
      .returning();
    if (!route) return tx.rollback();

    // Then generate the route sequences
    const sequences = await tx
      .insert(routeSequences)
      .values(
        params.points.map((point) => ({
          routeId: route.id,
          sequenceNumber: point.sequence,
          address: point.address,
          point: [point.point[1], point.point[0]] as [number, number],
        }))).returning();
    if (sequences.length !== params.points.length) return tx.rollback();

    return {
      id: route.id,
      routeNumber: route.routeNumber,
      routeName: route.routeName,
      routeColor: route.routeColor,
      points: sequences.map(x => ({
        id: x.id,
        sequence: x.sequenceNumber,
        address: x.address,
        point: [x.point[1], x.point[0]],
      })),
    };
  });
}

/**
 * Deletes a route by its ID.
 *
 * Performs a lookup to confirm the route exists before deleting it. Returns a
 * typed `Failure` when the route does not exist or when the delete operation
 * fails, otherwise returns `Success(null)` on completion.
 *
 * @param {string} routeId
 *   The unique identifier of the route to remove.
 *
 * @returns {Promise<Failure<string> | Success<null>>}
 *   A discriminated result:
 *   - `Success(null)` when the route was deleted successfully.
 *   - `Failure(FailureCodes.ResourceNotFound, "Route not found")` when no route exists for the given ID.
 *   - `Failure(FailureCodes.Fatal, "Failed to delete route")` on unexpected/database errors.
 */
export async function removeRoute(routeId: string): Promise<Failure<string> | Success<null>> {
  try {
    const [route] = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!route) {
      return new Failure(FailureCodes.ResourceNotFound, "Route not found");
    }

    await db.delete(routes).where(eq(routes.id, routeId));
    return new Success(null);
  } catch {
    return new Failure(FailureCodes.Fatal, "Failed to delete route");
  }
}

/**
 * Updates a route and its sequence points atomically.
 *
 * - Route fields (`routeNumber`, `routeName`, `routeColor`) are optional and updated only when provided.
 * - If `points` is provided, the existing route sequence rows are replaced with the incoming ordered list.
 *   This guarantees reordering/add/delete behavior in one transaction.
 * - Incoming points are `[lat, lng]`; points are persisted as `[lng, lat]` for PostGIS.
 *
 * @param routeId Route identifier.
 * @param params Partial update payload.
 * @returns Failure or updated RouteObject.
 */
export async function updateRoute(
  routeId: string,
  params: UpdateRouteParameters,
): Promise<Failure<string> | Success<RouteObject>> {
  try {
    const [existingRoute] = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!existingRoute) {
      return new Failure(FailureCodes.ResourceNotFound, "Route not found");
    }

    const updated = await db.transaction(async tx => {
      const routePatch: Partial<{
        routeNumber: string;
        routeName: string;
        routeColor: string;
      }> = {};

      if (params.routeNumber !== undefined) routePatch.routeNumber = params.routeNumber;
      if (params.routeName !== undefined) routePatch.routeName = params.routeName;
      if (params.routeColor !== undefined) routePatch.routeColor = params.routeColor;

      if (Object.keys(routePatch).length > 0) {
        await tx
          .update(routes)
          .set(routePatch)
          .where(eq(routes.id, routeId));
      }

      if (params.points !== undefined) {
        await tx
          .delete(routeSequences)
          .where(eq(routeSequences.routeId, routeId));

        if (params.points.length > 0) {
          const inserted = await tx
            .insert(routeSequences)
            .values(
              params.points.map((point) => ({
                routeId,
                sequenceNumber: point.sequence,
                address: point.address ?? "Unknown Address",
                point: [point.point[1], point.point[0]] as [number, number],
              })),
            )
            .returning({ id: routeSequences.id });

          if (inserted.length !== params.points.length) {
            return tx.rollback();
          }
        }
      }

      const rows = await tx
        .select({
          routeId: routes.id,
          routeNumber: routes.routeNumber,
          routeName: routes.routeName,
          routeColor: routes.routeColor,
          pointId: routeSequences.id,
          sequence: routeSequences.sequenceNumber,
          address: routeSequences.address,
          sequencePoints: routeSequences.point,
        })
        .from(routes)
        .leftJoin(routeSequences, eq(routes.id, routeSequences.routeId))
        .where(eq(routes.id, routeId))
        .orderBy(asc(routeSequences.sequenceNumber));

      const base = rows[0];
      if (!base) return tx.rollback();

      const route: RouteObject = {
        id: base.routeId,
        routeNumber: base.routeNumber,
        routeName: base.routeName,
        routeColor: base.routeColor,
        points: rows
          .filter((row) => !!row.pointId)
          .map((row) => ({
            id: row.pointId!,
            sequence: row.sequence!,
            address: row.address!,
            point: [row.sequencePoints![1], row.sequencePoints![0]],
          })),
      };

      return route;
    });

    return new Success(updated);
  } catch {
    return new Failure(FailureCodes.Fatal, "Failed to update route");
  }
}

export interface AddRouteParameters {
  routeNumber: string;
  routeName: string;
  routeColor: string;
  points: Array<{
    sequence: number;
    address: string;
    point: [number, number];
  }>;
}

export interface UpdateRouteParameters {
  routeNumber?: string;
  routeName?: string;
  routeColor?: string;
  points?: Array<{
    sequence: number;
    address?: string;
    point: [number, number];
  }>;
}

export interface RouteObject {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  points: Array<{
    id: string;
    sequence: number;
    address: string;
    point: [number, number];
  }>;
}
