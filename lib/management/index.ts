"use server";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { routes, routeSequences } from "@/lib/db/schema";
import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";

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

    // Transform flat rows into your desired nested structure
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

export interface RouteObject {
  id: string | number,
  routeNumber: string,
  routeName: string,
  routeColor: string,
  points: Array<{
    id: string | number,
    sequence: number,
    address: string,
    point: [number, number]
  }>
}
