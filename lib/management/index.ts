import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { region, regionSequences, regionStations, routes, routeSequences } from "@/lib/db/schema";
import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";

export async function getAllRoutes() {
  const result = await db
    .select({
      id: routes.id,
      routeNumber: routes.routeNumber,
      routeName: routes.routeName,
      routeColor: routes.routeColor,

      // Build the nested { goingTo: [], goingBack: [] } structure
      points: sql<{ goingTo: PointObject[]; goingBack: PointObject[] }>`
        json_build_object(
          'polylineGoingTo', ${routes.polylineGoingTo},
          'goingTo', COALESCE(
            json_agg(
              json_build_object(
                'id', ${routeSequences.id},
                'sequence', ${routeSequences.sequenceNumber},
                'address', ${routeSequences.address},
                -- Manually parse the geometry into a JSON [x, y] array
                'point', json_build_array(
                  ST_Y(${routeSequences.point}),
                  ST_X(${routeSequences.point})
                )
              ) ORDER BY ${routeSequences.sequenceNumber} ASC
            ) FILTER (WHERE ${routeSequences.sequenceType} = 'going_to'), '[]'::json
          ),
          'polylineGoingBack', ${routes.polylineGoingBack},
          'goingBack', COALESCE(
            json_agg(
              json_build_object(
                'id', ${routeSequences.id},
                'sequence', ${routeSequences.sequenceNumber},
                'address', ${routeSequences.address},
                -- Again, manually parse the geometry into a JSON [x, y] array
                'point', json_build_array(
                  ST_Y(${routeSequences.point}),
                  ST_X(${routeSequences.point})
                )
              ) ORDER BY ${routeSequences.sequenceNumber} ASC
            ) FILTER (WHERE ${routeSequences.sequenceType} = 'going_back'), '[]'::json
          )
        )
      `,
    })
    .from(routes)
    .leftJoin(routeSequences, eq(routes.id, routeSequences.routeId))
    .groupBy(routes.id, routes.routeNumber, routes.routeName, routes.routeColor);

  return result;
}

export async function addRoute(params: AddRouteParameters): Promise<RouteObject> {
  return db.transaction(async tx => {
    // Create the route first
    const [route] = await tx
      .insert(routes)
      .values({
        routeName: params.routeName,
        routeNumber: params.routeNumber,
        routeColor: params.routeColor,
        polylineGoingTo: params.polylineGoingTo ?? "",
        polylineGoingBack: params.polylineGoingBack ?? "",
      })
      .returning();
    if (!route) return tx.rollback();

    // Then generate the route sequences
    const newPoints = [
      ...params.points.goingTo.map(m => ({
        routeId: route.id,
        sequenceType: "going_to" as const,
        sequenceNumber: m.sequence,
        address: m.address,
        point: [m.point[1], m.point[0]] as [number, number],
      })),
      ...params.points.goingBack.map(m => ({
        routeId: route.id,
        sequenceType: "going_back" as const,
        sequenceNumber: m.sequence,
        address: m.address,
        point: [m.point[1], m.point[0]] as [number, number],
      })),
    ];

    let sequences: typeof routeSequences.$inferSelect[] = [];
    if (newPoints.length > 0) {
      sequences = await tx
        .insert(routeSequences)
        .values(newPoints)
        .returning();
    }

    return {
      id: route.id,
      routeNumber: route.routeNumber,
      routeName: route.routeName,
      routeColor: route.routeColor,
      points: {
        polylineGoingTo: route.polylineGoingTo,
        goingTo: sequences
          .filter(x => x.sequenceType === "going_to")
          .map(x => ({
            id: x.id,
            address: x.address,
            sequence: x.sequenceNumber,
            point: [x.point[1], x.point[0]] as [number, number],
          })),
        polylineGoingBack: route.polylineGoingBack,
        goingBack: sequences
          .filter(x => x.sequenceType === "going_back")
          .map(x => ({
            id: x.id,
            address: x.address,
            sequence: x.sequenceNumber,
            point: [x.point[1], x.point[0]] as [number, number],
          })),
      },
    };
  });
}

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

export async function updateRoute(
  routeId: string,
  params: UpdateRouteParameters,
): Promise<Failure<string> | Success<RouteObject>> {
  try {
    const finalResult = await db.transaction(async (tx) => {
      // Handle Route Parent Data
      let routeData;
      const routePatch = {
        ...(params.routeNumber !== undefined && { routeNumber: params.routeNumber }),
        ...(params.routeName !== undefined && { routeName: params.routeName }),
        ...(params.routeColor !== undefined && { routeColor: params.routeColor }),
        ...(params.polylineGoingTo !== undefined && { polylineGoingTo: params.polylineGoingTo }),
        ...(params.polylineGoingBack !== undefined && { polylineGoingBack: params.polylineGoingBack }),
      };

      if (Object.keys(routePatch).length > 0) {
        // Update and grab the fresh row
        [routeData] = await tx
          .update(routes)
          .set(routePatch)
          .where(eq(routes.id, routeId))
          .returning();
      } else {
        // If we didn't update the parent, just fetch it once to ensure it exists
        [routeData] = await tx
          .select()
          .from(routes)
          .where(eq(routes.id, routeId))
          .limit(1);
      }

      if (!routeData) {
        tx.rollback();
      }

      // Handle Sequences Data
      const goingTo: PointObject[] = [];
      const goingBack: PointObject[] = [];

      if (params.points) {
        // Delete old points
        await tx.delete(routeSequences).where(eq(routeSequences.routeId, routeId));

        const totalExpected = params.points.goingTo.length + params.points.goingBack.length;
        if (totalExpected > 0) {
          const newPoints = [
            ...params.points.goingTo.map(m => ({
              routeId,
              sequenceType: "going_to" as const,
              sequenceNumber: m.sequence,
              address: m.address,
              point: [m.point[1], m.point[0]] as [number, number],
            })),
            ...params.points.goingBack.map(m => ({
              routeId,
              sequenceType: "going_back" as const,
              sequenceNumber: m.sequence,
              address: m.address,
              point: [m.point[1], m.point[0]] as [number, number],
            })),
          ];

          const insertedSeqs = await tx.insert(routeSequences).values(newPoints).returning();
          for (const seq of insertedSeqs) {
            const pointObj: PointObject = {
              id: seq.id,
              sequence: seq.sequenceNumber,
              address: seq.address,
              point: [seq.point[1], seq.point[0]] as [number, number],
            };
            if (seq.sequenceType === "going_to") goingTo.push(pointObj);
            else goingBack.push(pointObj);
          }
        }
      } else {
        // If points weren't updated, we MUST fetch the existing ones to fulfill the return type
        const existingSeqs = await tx.query.routeSequences.findMany({
          where: eq(routeSequences.routeId, routeId),
          orderBy: (seq, { asc }) => [asc(seq.sequenceNumber)],
        });

        for (const seq of existingSeqs) {
          const pointObj: PointObject = {
            id: seq.id,
            sequence: seq.sequenceNumber,
            address: seq.address,
            point: [seq.point[1], seq.point[0]] as [number, number],
          };
          if (seq.sequenceType === "going_to") {
            goingTo.push(pointObj);
          } else {
            goingBack.push(pointObj);
          }
        }
      }

      return {
        id: routeData.id,
        routeNumber: routeData.routeNumber,
        routeName: routeData.routeName,
        routeColor: routeData.routeColor,
        points: {
          polylineGoingTo: routeData.polylineGoingTo,
          goingTo,
          polylineGoingBack: routeData.polylineGoingBack,
          goingBack,
        },
      } as RouteObject;

    });

    return new Success(finalResult);
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

export interface PointObject {
  id: string;
  sequence: number;
  address: string;
  point: [number, number];
}

export interface AddRouteParameters {
  routeNumber: string;
  routeName: string;
  routeColor: string;
  polylineGoingTo: string;
  polylineGoingBack: string;
  points: {
    goingTo: Array<Omit<PointObject, "id">>;
    goingBack: Array<Omit<PointObject, "id">>;
  }
}

export interface UpdateRouteParameters {
  routeNumber?: string;
  routeName?: string;
  routeColor?: string;
  polylineGoingTo?: string;
  polylineGoingBack?: string;
  points?: {
    goingTo: Array<Omit<PointObject, "id">>;
    goingBack: Array<Omit<PointObject, "id">>;
  };
}

export interface RouteObject {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  points: {
    polylineGoingTo: string;
    goingTo: Array<PointObject>;
    polylineGoingBack: string;
    goingBack: Array<PointObject>;
  }
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
