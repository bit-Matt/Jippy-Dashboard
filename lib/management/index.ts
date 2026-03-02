import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { region, regionSequences, regionStations, routes, routeSequences } from "@/lib/db/schema";
import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";

export async function getAllRoutes() {
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
    let route = acc.find(r => r.id === row.routeId);

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
  }, [] as RouteObject[]);

  return result;
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

export async function getAllRegions() {
  const rows = await db
    .select({
      regionName: region.name,
      regionColor: region.color,
      regionShape: region.shapeType,
      regionId: region.id,

      // Sequences
      pointId: regionSequences.id,
      sequence: regionSequences.sequenceNumber,
      sequencePoints: regionSequences.point,

      // Stations
      stationId: regionStations.id,
      stationAddress: regionStations.address,
      stationPoints: regionStations.point,
    })
    .from(region)
    .leftJoin(regionSequences, eq(region.id, regionSequences.regionId))
    .leftJoin(regionStations, eq(region.id, regionStations.regionId))
    .orderBy(asc(region.createdAt), asc(regionSequences.sequenceNumber));

  // Transform
  const result = rows.reduce((acc, row) => {
    let region = acc.find(r => r.id === row.regionId);

    if (!region) {
      region = {
        id: row.regionId,
        regionName: row.regionName,
        regionColor: row.regionColor,
        regionShape: row.regionShape,
        points: [],
        stations: [],
      };

      acc.push(region);
    }

    if (row.pointId) {
      const existingPoint = region.points.find((point) => point.id === row.pointId);
      if (!existingPoint) {
        region.points.push({
          id: row.pointId,
          sequence: row.sequence!,
          point: [row.sequencePoints![1], row.sequencePoints![0]],
        });
      }
    }

    if (row.stationId) {
      const existingStation = region.stations.find((station) => station.id === row.stationId);
      if (!existingStation) {
        region.stations.push({
          id: row.stationId,
          address: row.stationAddress!,
          point: [row.stationPoints![1], row.stationPoints![0]],
        });
      }
    }

    return acc;
  }, [] as Array<RegionObject>);

  return result;
}

export async function createRegion(payload: RegionAddParameters) {
  return db.transaction(async tx => {
    const [newRegion] = await tx
      .insert(region)
      .values({
        name: payload.regionName,
        color: payload.regionColor,
        shapeType: payload.regionShape,
      })
      .returning();
    if (!newRegion) return tx.rollback();

    // Generate sequences
    const sequences = await tx
      .insert(regionSequences)
      .values(
        payload.points.map(point => ({
          regionId: newRegion.id,
          sequenceNumber: point.sequence,
          point: [point.point[1], point.point[0]] as [number, number],
        })),
      )
      .returning();
    if (sequences.length !== payload.points.length) return tx.rollback();

    let stations: Array<{ id: string; address: string; point: [number, number] }> = [];
    if (payload.stations.length > 0) {
      const stationCreateResult = await tx
        .insert(regionStations)
        .values(
          payload.stations.map(point => ({
            regionId: newRegion.id,
            address: point.address,
            point: [point.point[1], point.point[0]] as [number, number],
          })),
        )
        .returning();
      stations = stationCreateResult.map(s => ({
        id: s.id,
        address: s.address,
        point: [s.point[1], s.point[0]],
      }));
    }

    return {
      id: newRegion.id,
      regionName: newRegion.name,
      regionColor: newRegion.color,
      regionShape: newRegion.shapeType,
      points: sequences.map(x => ({
        id: x.id,
        sequence: x.sequenceNumber,
        point: [x.point[1], x.point[0]],
      })),
      stations,
    } satisfies RegionObject;
  });
}

export async function removeRegion(regionId: string) {
  try {
    const [selectedRegion] = await db
      .select({ id: region.id })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);
    if (!selectedRegion) {
      return new Failure(FailureCodes.ResourceNotFound, "Region not found.");
    }

    await db.delete(region).where(eq(region.id, regionId));
    return new Success(null);
  } catch {
    return new Failure(FailureCodes.Fatal, "Unable to delete a region due to an exeception.");
  }
}

export async function updateRegion(
  regionId: string,
  params: UpdateRegionParameters,
) {
  try {
    const [selectedRegion] = await db
      .select({ id: region.id })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);
    if (!selectedRegion) {
      return new Failure(FailureCodes.ResourceNotFound, "Region cannot be found.");
    }

    const updated = await db.transaction(async tx => {
      const regionPatch: Partial<{
        name: string;
        color: string;
        shapeType: string;
      }> = {};

      if (params.regionName !== undefined) regionPatch.name = params.regionName;
      if (params.regionColor !== undefined) regionPatch.color = params.regionColor;
      if (params.regionShape !== undefined) regionPatch.shapeType = params.regionShape;

      if (Object.keys(regionPatch).length > 0) {
        await tx
          .update(region)
          .set(regionPatch)
          .where(eq(region.id, regionId));
      }

      if (params.points !== undefined) {
        await tx
          .delete(regionSequences)
          .where(eq(regionSequences.regionId, regionId));

        if (params.points.length > 0) {
          const inserted = await tx
            .insert(regionSequences)
            .values(
              params.points.map(point => ({
                regionId,
                sequenceNumber: point.sequence,
                point: [point.point[1], point.point[0]] as [number, number],
              })),
            )
            .returning({ id: regionSequences.id });

          if (inserted.length !== params.points.length) {
            return tx.rollback();
          }
        }
      }

      if (params.stations !== undefined) {
        await tx
          .delete(regionStations)
          .where(eq(regionStations.regionId, regionId));

        if (params.stations.length > 0) {
          const inserted = await tx
            .insert(regionStations)
            .values(
              params.stations.map(point => ({
                regionId,
                address: point.address,
                point: [point.point[1], point.point[0]] as [number, number],
              })),
            )
            .returning({ id: regionStations.id });

          if (inserted.length !== params.stations.length) {
            return tx.rollback();
          }
        }
      }

      const rows = await tx
        .select({
          regionId: region.id,
          regionName: region.name,
          regionColor: region.color,
          regionShape: region.shapeType,
          pointId: regionSequences.id,
          sequence: regionSequences.sequenceNumber,
          sequencePoints: regionSequences.point,
          stationId: regionStations.id,
          stationAddress: regionStations.address,
          stationPoint: regionStations.point,
        })
        .from(region)
        .leftJoin(regionSequences, eq(region.id, regionSequences.regionId))
        .leftJoin(regionStations, eq(region.id, regionStations.regionId))
        .where(eq(region.id, regionId))
        .orderBy(asc(region.createdAt), asc(regionSequences.sequenceNumber));

      const base = rows[0];
      if (!base) return tx.rollback();

      const updatedRegion: RegionObject = {
        id: base.regionId,
        regionName: base.regionName,
        regionColor: base.regionColor,
        regionShape: base.regionShape,
        points: rows
          .filter(row => !!row.pointId)
          .map(row => ({
            id: row.pointId!,
            sequence: row.sequence!,
            point: [row.sequencePoints![1], row.sequencePoints![0]] as [number, number],
          }))
          .filter((point, index, arr) => arr.findIndex((x) => x.id === point.id) === index),
        stations: rows
          .filter(row => !!row.stationId)
          .map(row => ({
            id: row.stationId!,
            address: row.stationAddress!,
            point: [row.stationPoint![1], row.stationPoint![0]] as [number, number],
          }))
          .filter((station, index, arr) => arr.findIndex((x) => x.id === station.id) === index),
      };

      return updatedRegion;
    });

    return new Success(updated);
  } catch {
    return new Failure(FailureCodes.Fatal, "Failed to update region.");
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

export interface RegionObject {
  id: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<{
    id: string;
    sequence: number;
    point: [number, number];
  }>;
  stations: Array<{
    id: string;
    address: string;
    point: [number, number];
  }>;
}

export interface RegionAddParameters {
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

export interface UpdateRegionParameters {
  regionName?: string;
  regionColor?: string;
  regionShape?: string;
  points?: Array<{
    sequence: number;
    point: [number, number];
  }>;
  stations?: Array<{
    address: string;
    point: [number, number];
  }>;
}
