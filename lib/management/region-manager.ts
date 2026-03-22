import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { region, regionSequences, regionStations } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

/**
 * Fetches all regions with their metadata, ordered points, and stations.
 *
 * The query joins region records with their sequence points and station records,
 * then groups the flat rows into structured region objects. Geometry coordinates
 * are normalized into `[latitude, longitude]` format in the returned data.
 *
 * @returns A `Promise<Result<RegionObject[]>>` containing the list of regions, or a failure if fetching fails.
 */
export async function getAllRegions(): Promise<Result<RegionObject[]>> {
  try {
    const result = await db
      .select({
        id: region.id,
        regionName: region.name,
        regionColor: region.color,
        regionShape: region.shapeType,
        regionId: region.id,

        points: sql<PointObject[]>`(
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ${regionSequences.id},
              'sequence', ${regionSequences.sequenceNumber},
              'point', json_build_array(
                ST_Y(${regionSequences.point}),
                ST_X(${regionSequences.point})
              )
            ) ORDER BY ${regionSequences.sequenceNumber} ASC
          ), '[]'::json
        )
        FROM ${regionSequences}
        WHERE ${regionSequences.regionId} = "region_markers"."id")`,

        stations: sql<StationObject[]>`(
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ${regionStations.id},
              'address', ${regionStations.address},
              'point', json_build_array(
                ST_Y(${regionStations.point}),
                ST_X(${regionStations.point})
              )
            )
          ), '[]'::json
        )
        FROM ${regionStations}
        WHERE ${regionStations.regionId} = "region_markers"."id")`,
      })
      .from(region);

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch regions.", {}, e);
  }
}

/**
 * Creates a new region with its sequence points and optional stations inside a single transaction.
 *
 * The region is inserted first, followed by its ordered points. If station data is provided,
 * it is inserted as well. All coordinates are normalized before persistence and restored to
 * `[latitude, longitude]` format in the returned object.
 *
 * @param payload - Region data to create, including metadata, points, and optional stations.
 * @returns A `Result<RegionObject>` containing the created region, or a failure if creation fails.
 */
export async function createRegion(payload: RegionAddParameters): Promise<Result<RegionObject>> {
  try {
    const result = await db.transaction(async tx => {
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

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create region.", {}, e);
  }
}

/**
 * Deletes a region by its identifier after confirming it exists.
 *
 * If the region cannot be found, a resource-not-found failure is returned.
 * Otherwise, the region is removed and a success result is returned.
 *
 * @param regionId - The unique identifier of the region to delete.
 * @returns A `Result<null>` indicating success, not found, or a fatal failure.
 */
export async function removeRegion(regionId: string): Promise<Result<null>> {
  try {
    const [selectedRegion] = await db
      .select({ id: region.id })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);
    if (!selectedRegion) {
      return new Failure(ErrorCodes.ResourceNotFound, "Region not found.", { regionId });
    }

    await db.delete(region).where(eq(region.id, regionId));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete a region due to an exeception.", { regionId }, e);
  }
}

/**
 * Updates an existing region and optionally replaces its sequence points and stations.
 *
 * If metadata fields are provided, they are patched on the region row. When `params.points`
 * is provided, all existing region points are deleted and recreated. When `params.stations`
 * is provided, all existing stations are deleted and recreated. The updated region is then
 * reloaded and returned with coordinates normalized into `[latitude, longitude]` format.
 *
 * @param regionId - The unique identifier of the region to update.
 * @param params - The region fields and/or related collections to modify.
 * @returns A `Result<RegionObject>` containing the updated region, or a failure if the update fails.
 */
export async function updateRegion(
  regionId: string,
  params: UpdateRegionParameters,
) {
  try {
    const updated = await db.transaction(async tx => {
      // Patch to apply
      const regionPatch = {
        ...(params.regionName !== undefined && { name: params.regionName }),
        ...(params.regionColor !== undefined && { color: params.regionColor }),
        ...(params.regionShape !== undefined && { shapeType: params.regionShape }),
      };

      if (Object.keys(regionPatch).length > 0) {
        const [updatedRegion] = await tx
          .update(region)
          .set(regionPatch)
          .where(eq(region.id, regionId))
          .returning({ id: region.id });

        if (!updatedRegion) tx.rollback();
      } else {
        // If no parent fields are updated, just check if it exists
        const [existing] = await tx
          .select({ id: region.id })
          .from(region)
          .where(eq(region.id, regionId))
          .limit(1);

        if (!existing) tx.rollback();
      }

      if (params.points !== undefined) {
        await tx.delete(regionSequences).where(eq(regionSequences.regionId, regionId));

        if (params.points.length > 0) {
          await tx.insert(regionSequences).values(
            params.points.map((point) => ({
              regionId,
              sequenceNumber: point.sequence,
              point: [point.point[1], point.point[0]] as [number, number],
            })),
          );
        }
      }

      if (params.stations !== undefined) {
        await tx.delete(regionStations).where(eq(regionStations.regionId, regionId));

        if (params.stations.length > 0) {
          await tx.insert(regionStations).values(
            params.stations.map((station) => ({
              regionId,
              address: station.address,
              point: [station.point[1], station.point[0]] as [number, number],
            })),
          );
        }
      }

      // Return the updated result
      const [finalResult] = await db
        .select({
          id: region.id,
          regionName: region.name,
          regionColor: region.color,
          regionShape: region.shapeType,
          regionId: region.id,

          points: sql<PointObject[]>`(
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', ${regionSequences.id},
                'sequence', ${regionSequences.sequenceNumber},
                'point', json_build_array(
                  ST_Y(${regionSequences.point}),
                  ST_X(${regionSequences.point})
                )
              ) ORDER BY ${regionSequences.sequenceNumber} ASC
            ), '[]'::json
          )
          FROM ${regionSequences}
          WHERE ${regionSequences.regionId} = "region_markers"."id")`,

          stations: sql<StationObject[]>`(
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', ${regionStations.id},
                'address', ${regionStations.address},
                'point', json_build_array(
                  ST_Y(${regionStations.point}),
                  ST_X(${regionStations.point})
                )
              )
            ), '[]'::json
          )
          FROM ${regionStations}
          WHERE ${regionStations.regionId} = "region_markers"."id")`,
        })
        .from(region)
        .where(eq(region.id, regionId));

      return finalResult;
    });

    return new Success(updated);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update region.", { regionId, params }, e);
  }
}

export interface PointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface StationObject {
  id: string;
  address: string;
  point: [number, number];
}

export interface RegionObject {
  id: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<PointObject>;
  stations: Array<StationObject>;
}

export interface RegionAddParameters {
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<Omit<PointObject, "id">>;
  stations: Array<Omit<StationObject, "id">>;
}

export interface UpdateRegionParameters {
  regionName?: string;
  regionColor?: string;
  regionShape?: string;
  points?: Array<Omit<PointObject, "id">>;
  stations?: Array<Omit<StationObject, "id">>;
}
