import {and, eq, sql} from "drizzle-orm";

import {db} from "@/lib/db";
import {region, regionSequences, regionSnapshots, regionStations} from "@/lib/db/schema";
import {ErrorCodes, Failure, Result, Success} from "@/lib/one-of/types";
import {unwrap} from "@/lib/one-of";

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
        activeSnapshotId: regionSnapshots.id,
        snapshotName: regionSnapshots.versionName,
        snapshotState: regionSnapshots.snapshotState,
        regionName: regionSnapshots.name,
        regionColor: regionSnapshots.color,
        regionShape: regionSnapshots.shapeType,
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
        WHERE ${regionSnapshots.regionId} = "region_snapshots"."id")`,

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
        WHERE ${regionSnapshots.regionId} = "region_snapshots"."id")`,
      })
      .from(region)
      .leftJoin(regionSnapshots, eq(region.activeSnapshotId, regionSnapshots.id))
      .groupBy(region.id, regionSnapshots.id);

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch regions.", {}, e);
  }
}

/**
 * Fetches a region by its ID, including active snapshot metadata, ordered boundary points,
 * and associated station markers.
 *
 * The result contains:
 * - region identifiers and display metadata (`regionName`, `regionColor`, `regionShape`)
 * - `points`: ordered region geometry points
 * - `stations`: station list with address and coordinates
 *
 * Coordinates are returned in `[latitude, longitude]` format.
 *
 * @param regionId - The unique identifier of the region to retrieve.
 * @param [snapshotId] - The unique identifier of the snapshot to use. If unspecified, it will use the active
 *                       selected snapshot.
 * @returns A `Result<RegionObject>`:
 * - `Success<RegionObject>` when the region exists.
 * - `Failure` with `ErrorCodes.ResourceNotFound` when no matching region is found.
 * - `Failure` with `ErrorCodes.Fatal` when an unexpected database error occurs.
 */
export async function getRegionById(regionId: string, snapshotId?: string): Promise<Result<RegionObject>> {
  try {
    const [result] = await db
      .select({
        id: region.id,
        activeSnapshotId: regionSnapshots.id,
        snapshotName: regionSnapshots.versionName,
        snapshotState: regionSnapshots.snapshotState,
        regionName: regionSnapshots.name,
        regionColor: regionSnapshots.color,
        regionShape: regionSnapshots.shapeType,
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
        WHERE ${regionSnapshots.regionId} = "region_snapshots"."id")`,

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
        WHERE ${regionSnapshots.regionId} = "region_snapshots"."id")`,
      })
      .from(region)
      .leftJoin(regionSnapshots, eq(regionSnapshots.id, snapshotId ? snapshotId : region.activeSnapshotId))
      .where(eq(region.id, regionId))
      .groupBy(region.id, regionSnapshots.id)
      .limit(1);

    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "Region not found.", { regionId });
    }

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch regions.", {}, e);
  }
}

/**
 * Creates a new snapshot for an existing region, including boundary points and optional stations.
 *
 * This operation runs in a transaction and performs:
 * 1. Region existence validation.
 * 2. Region snapshot insertion.
 * 3. Boundary sequence insertion.
 * 4. Optional station insertion.
 *
 * Coordinate mapping note:
 * - Input/output coordinates use `[lat, lng]`.
 * - Stored geometry coordinates are persisted as `[lng, lat]`.
 *
 * @param regionId - The ID of the region that will own the new snapshot.
 * @param params - Snapshot payload containing region metadata, ordered boundary points,
 * and optional station markers.
 * @returns A `Result<RegionObject>`:
 * - `Success<RegionObject>` with the created snapshot data.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if the region does not exist.
 * - `Failure` with `ErrorCodes.Fatal` if snapshot creation fails unexpectedly.
 */
export async function createSnapshot(regionId: string, params: RegionAddParameters): Promise<Result<RegionObject>> {
  try {
    const [regionTarget] = await db
      .select({ id: region.id })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);
    if (!regionTarget) {
      return new Failure(ErrorCodes.ResourceNotFound, "Region not found.", { regionId });
    }

    const transaction = await db.transaction(async tx => {
      // Create a snapshot
      const [snapshot] = await tx
        .insert(regionSnapshots)
        .values({
          versionName: params.snapshotName,
          regionId: regionTarget.id,
          name: params.regionName,
          color: params.regionColor,
          shapeType: params.regionShape,
        })
        .returning();

      // Generate sequences
      const sequences = await tx
        .insert(regionSequences)
        .values(
          params.points.map(point => ({
            regionSnapshotId: snapshot.id,
            sequenceNumber: point.sequence,
            point: [point.point[1], point.point[0]] as [number, number],
          })),
        )
        .returning();
      if (sequences.length !== params.points.length) return tx.rollback();

      let stations: Array<{ id: string; address: string; point: [number, number] }> = [];
      if (params.stations.length > 0) {
        const stationCreateResult = await tx
          .insert(regionStations)
          .values(
            params.stations.map(point => ({
              regionSnapshotId: snapshot.id,
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
        id: snapshot.id,
        activeSnapshotId: snapshot.id,
        snapshotName: snapshot.versionName,
        snapshotState: snapshot.snapshotState,
        regionName: snapshot.name,
        regionColor: snapshot.color,
        regionShape: snapshot.shapeType,
        points: sequences.map(x => ({
          id: x.id,
          sequence: x.sequenceNumber,
          point: [x.point[1], x.point[0]],
        })),
        stations,
      } satisfies RegionObject;
    });

    return new Success(transaction);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create a region snapshot.", { regionId, params }, e);
  }
}

/**
 * Clones an existing region snapshot (shape points and stations) into a new `"wip"` snapshot.
 *
 * The copy process:
 * 1. Validates that the source snapshot exists and belongs to the region.
 * 2. Loads all region boundary sequences and station records from the source snapshot.
 * 3. Creates a new snapshot with copied metadata and a `"(Copy)"` suffix in the version name.
 * 4. Re-inserts copied sequences and stations under the new snapshot ID.
 *
 * Executed inside a database transaction to ensure atomicity.
 *
 * @param regionId - The ID of the region that owns the snapshot.
 * @param sourceSnapshotId - The snapshot ID to duplicate.
 * @returns A `Result<SnapshotItem>`:
 * - `Success<SnapshotItem>` with the new snapshot summary (`id`, `name`, `state`, timestamps).
 * - `Failure` with `ErrorCodes.ResourceNotFound` if the source snapshot is missing.
 * - `Failure` with `ErrorCodes.Fatal` if cloning fails unexpectedly.
 */
export async function copySnapshot(regionId: string, sourceSnapshotId: string): Promise<Result<SnapshotItem>> {
  try {
    const [snapshot] = await db
      .select()
      .from(regionSnapshots)
      .where(
        and(
          eq(regionSnapshots.id, sourceSnapshotId),
          eq(regionSnapshots.regionId, regionId),
        ),
      )
      .limit(1);
    if (!snapshot) {
      return new Failure(ErrorCodes.ResourceNotFound, "Snapshot not found.", { regionId, sourceSnapshotId });
    }

    // Copy the snapshot points
    const shape = await db
      .select()
      .from(regionSequences)
      .where(eq(regionSequences.regionSnapshotId, snapshot.id));

    const stations = await db
      .select()
      .from(regionStations)
      .where(eq(regionStations.regionSnapshotId, snapshot.id));

    // Create a new snapshot
    const result = await db.transaction(async tx => {
      const [newSnapshot] = await tx
        .insert(regionSnapshots)
        .values({
          snapshotState: "wip",
          regionId: snapshot.regionId,
          versionName: snapshot.versionName + " (Copy)",
          name: snapshot.name,
          color: snapshot.color,
          shapeType: snapshot.shapeType,
        })
        .returning();
      if (!newSnapshot) return tx.rollback();

      if (shape.length >= 0) {
        await tx
          .insert(regionSequences)
          .values(shape.map(p => ({
            sequenceNumber: p.sequenceNumber,
            point: p.point,
            regionSnapshotId: newSnapshot.id,
          })));
      }

      if (stations.length >= 0) {
        await tx
          .insert(regionStations)
          .values(stations.map(s => ({
            point: s.point,
            address: s.address,
            regionSnapshotId: newSnapshot.id,
          })));
      }

      return {
        id: newSnapshot.id,
        name: newSnapshot.versionName,
        state: newSnapshot.snapshotState,
        createdOn: newSnapshot.createdAt,
        updatedAt: newSnapshot.updatedAt,
      };
    });

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Snapshot copying failed.", { regionId, sourceSnapshotId }, e);
  }
}

/**
 * Switches a region's active snapshot to the specified snapshot and returns the updated region data.
 *
 * Workflow:
 * 1. Verifies the region exists.
 * 2. Verifies the target snapshot exists.
 * 3. Applies snapshot-state validation before activation.
 * 4. Updates the region's `activeSnapshotId`.
 * 5. Fetches and returns the resolved region payload.
 *
 * @param regionId - The ID of the region to update.
 * @param snapshotId - The ID of the snapshot to activate.
 * @returns A `Result<RegionObject>`:
 * - `Success<RegionObject>` with the region after the active snapshot switch.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if region or snapshot is not found.
 * - `Failure` with `ErrorCodes.ValidationFailure` if the snapshot state is not eligible for switching.
 * - `Failure` with `ErrorCodes.Fatal` if an unexpected error occurs.
 */
export async function switchSnapshot(regionId: string, snapshotId: string): Promise<Result<RegionObject>> {
  try {
    const [regionToEdit] = await db
      .select({ id: region.id })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);
    if (!regionToEdit) {
      return new Failure(ErrorCodes.ResourceNotFound, "Region not found.", { regionId });
    }

    const [snapshotToUse] = await db
      .select({ id: regionSnapshots.id, state: regionSnapshots.snapshotState })
      .from(regionSnapshots)
      .where(eq(regionSnapshots.id, snapshotId))
      .limit(1);
    if (!snapshotToUse) {
      return new Failure(ErrorCodes.ResourceNotFound, "Snapshot not found.", { regionId, snapshotId });
    }

    // Check if the state is ready
    if (snapshotToUse.state !== "ready") {
      return new Failure(ErrorCodes.ValidationFailure, "Snapshot is not in a ready state. Cannot be used.", { regionId, snapshotId, snapshotToUse });
    }

    // Finally swap
    await db
      .update(region)
      .set({ activeSnapshotId: snapshotToUse.id })
      .where(eq(region.id, regionId));

    const result = await unwrap(getRegionById(regionId));
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to switch region snapshot.", { regionId, snapshotId }, e);
  }
}

export async function getAllSnapshots(closureId: string): Promise<Result<SnapshotItem[]>> {
  try {
    const snapshots = await db
      .select({
        id: regionSnapshots.id,
        name: regionSnapshots.versionName,
        createdOn: regionSnapshots.createdAt,
        updatedAt: regionSnapshots.updatedAt,
        state: regionSnapshots.snapshotState,
      })
      .from(regionSnapshots)
      .where(eq(regionSnapshots.regionId, closureId));

    return new Success(snapshots);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get all the snapshots", { closureId }, e);
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
    const [newRegion] = await db
      .insert(region)
      .values({
        activeSnapshotId: "unset",
      })
      .returning();
    if (!newRegion) {
      return new Failure(ErrorCodes.Fatal, "Failed to create region.", {});
    }

    // Create snapshot
    const snapshot = await unwrap(createSnapshot(newRegion.id, payload));

    // Update the active snapshot
    await db
      .update(region)
      .set({ activeSnapshotId: snapshot.id })
      .where(eq(region.id, newRegion.id));

    return new Success({
      ...snapshot,
      id: newRegion.id,
    });
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
 * @param snapshotId - The unique identifier of the snapshot to update.
 * @param params - The region fields and/or related collections to modify.
 * @returns A `Result<RegionObject>` containing the updated region, or a failure if the update fails.
 */
export async function updateRegionSnapshot(
  regionId: string,
  snapshotId: string,
  params: UpdateRegionParameters,
) {
  try {
    const [snapshotToEdit] = await db
      .select({ id: regionSnapshots.id, state: regionSnapshots.snapshotState })
      .from(regionSnapshots)
      .where(
        and(
          eq(regionSnapshots.id, snapshotId),
          eq(regionSnapshots.regionId, regionId),
        ),
      )
      .limit(1);
    if (!snapshotToEdit) {
      return new Failure(ErrorCodes.ResourceNotFound, "Region snapshot not found.", { regionId, snapshotId });
    }

    if (snapshotToEdit.state === "ready") {
      return new Failure(ErrorCodes.ResourceNotFound, "Snapshot is not editable. Create a new copy and edit.", { regionId, snapshotId });
    }

    // Update snapshot
    await db.transaction(async tx => {
      // Patch to apply
      const regionPatch = {
        ...(params.snapshotName !== undefined && { versionName: params.snapshotName }),
        ...(params.regionName !== undefined && { name: params.regionName }),
        ...(params.regionColor !== undefined && { color: params.regionColor }),
        ...(params.regionShape !== undefined && { shapeType: params.regionShape }),
      };

      if (Object.keys(regionPatch).length > 0) {
        const [updatedRegion] = await tx
          .update(regionSnapshots)
          .set(regionPatch)
          .where(eq(regionSnapshots.id, snapshotToEdit.id))
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
        await tx.delete(regionSequences).where(eq(regionSequences.regionSnapshotId, snapshotToEdit.id));

        if (params.points.length > 0) {
          await tx.insert(regionSequences).values(
            params.points.map((point) => ({
              regionSnapshotId: snapshotToEdit.id,
              sequenceNumber: point.sequence,
              point: [point.point[1], point.point[0]] as [number, number],
            })),
          );
        }
      }

      if (params.stations !== undefined) {
        await tx.delete(regionStations).where(eq(regionStations.regionSnapshotId, snapshotToEdit.id));

        if (params.stations.length > 0) {
          await tx.insert(regionStations).values(
            params.stations.map((station) => ({
              regionSnapshotId: snapshotToEdit.id,
              address: station.address,
              point: [station.point[1], station.point[0]] as [number, number],
            })),
          );
        }
      }
    });

    const updated = await unwrap(getRegionById(regionId, snapshotToEdit.id));
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
  activeSnapshotId: string;
  snapshotName: string;
  snapshotState: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<PointObject>;
  stations: Array<StationObject>;
}

export interface RegionAddParameters {
  snapshotName: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<Omit<PointObject, "id">>;
  stations: Array<Omit<StationObject, "id">>;
}

export interface UpdateRegionParameters {
  snapshotName?: string;
  regionName?: string;
  regionColor?: string;
  regionShape?: string;
  points?: Array<Omit<PointObject, "id">>;
  stations?: Array<Omit<StationObject, "id">>;
}

export interface SnapshotItem {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  updatedAt: Date;
}
