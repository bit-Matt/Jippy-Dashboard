import {and, eq, sql} from "drizzle-orm";

import {db} from "@/lib/db";
import {region, regionSequences, regionSnapshots, regionStations} from "@/lib/db/schema";
import {ErrorCodes, Failure, Result, Success} from "@/lib/one-of/types";
import {unwrap} from "@/lib/one-of";

/**
 * Fetches all regions with their active snapshot's points and stations.
 *
 * Reads region metadata (`name`, `color`, `shapeType`) directly from the `region` table,
 * which holds the applied active snapshot information. Points and stations are resolved
 * from the active snapshot. No snapshot-level metadata (version name, state) is returned.
 *
 * @param readyActiveOnly - When `true`, only regions with `isPublic` set to `true` are returned.
 * @returns A `Promise<Result<RegionObject[]>>` containing the list of regions, or a failure if fetching fails.
 */
export async function getAllRegions(forPublic = false): Promise<Result<RegionBaseObject[] | RegionListObject[]>> {
  try {
    const sqlTemplates = {
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
        WHERE ${regionSequences.regionSnapshotId} = ${region.activeSnapshotId})`,

      stations: sql<StationObject[]>`(
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ${regionStations.id},
              'address', ${regionStations.address},
              'availableFrom', ${regionStations.availableFrom},
              'availableTo', ${regionStations.availableTo},
              'point', json_build_array(
                ST_Y(${regionStations.point}),
                ST_X(${regionStations.point})
              )
            )
          ), '[]'::json
        )
        FROM ${regionStations}
        WHERE ${regionStations.regionSnapshotId} = ${region.activeSnapshotId})`,
    };

    // For public API
    if (forPublic) {
      const result = await db
        .select({
          id: region.id,
          regionName: region.name,
          regionColor: region.color,
          regionShape: region.shapeType,
          ...sqlTemplates,
        })
        .from(region)
        .where(eq(region.isPublic, true));

      return new Success(result satisfies RegionBaseObject[]);
    }

    const result = await db
      .select({
        id: region.id,
        regionName: region.name,
        regionColor: region.color,
        regionShape: region.shapeType,
        points: sqlTemplates.points,
      })
      .from(region);

    return new Success(result satisfies RegionListObject[]);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch regions.", {}, e);
  }
}

export async function getRegionById(regionId: string): Promise<Result<RegionObject>> {
  try {
    const [result] = await db
      .select({
        id: region.id,
        activeSnapshotId: region.activeSnapshotId,
        isPublic: region.isPublic,
        regionName: region.name,
        regionColor: region.color,
        regionShape: region.shapeType,
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
          WHERE ${regionSequences.regionSnapshotId} = ${region.activeSnapshotId})`,

        stations: sql<StationObject[]>`(
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', ${regionStations.id},
                'address', ${regionStations.address},
                'availableFrom', ${regionStations.availableFrom},
                'availableTo', ${regionStations.availableTo},
                'point', json_build_array(
                  ST_Y(${regionStations.point}),
                  ST_X(${regionStations.point})
                )
              )
            ), '[]'::json
          )
          FROM ${regionStations}
          WHERE ${regionStations.regionSnapshotId} = ${region.activeSnapshotId})`,
      })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);

    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "Unable to find region.", { regionId });
    }

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch region.", { regionId }, e);
  }
}

/**
 * Fetches snapshot-level information for a specific region snapshot.
 *
 * Reads snapshot metadata (`snapshotName`, `snapshotState`, `regionName`, `regionColor`, `regionShape`)
 * from the `regionSnapshots` table. Points and stations are loaded from the snapshot's associated records.
 * Coordinates are returned in `[latitude, longitude]` format.
 *
 * @param regionId - The unique identifier of the region.
 * @param snapshotId - The unique identifier of the snapshot to fetch.
 * @returns A `Result<RegionSnapshotObject>`:
 * - `Success<RegionSnapshotObject>` when the snapshot exists.
 * - `Failure` with `ErrorCodes.ResourceNotFound` when no matching snapshot is found.
 * - `Failure` with `ErrorCodes.Fatal` when an unexpected database error occurs.
 */
export async function getSnapshotInformationById(regionId: string, snapshotId: string): Promise<Result<RegionSnapshotObject>> {
  try {
    const [result] = await db
      .select({
        id: regionSnapshots.regionId,
        snapshotId: regionSnapshots.id,
        snapshotName: regionSnapshots.versionName,
        snapshotState: regionSnapshots.snapshotState,
        regionName: regionSnapshots.name,
        regionColor: regionSnapshots.color,
        regionShape: regionSnapshots.shapeType,

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
        WHERE ${regionSequences.regionSnapshotId} = ${snapshotId})`,

        stations: sql<StationObject[]>`(
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ${regionStations.id},
              'address', ${regionStations.address},
              'availableFrom', ${regionStations.availableFrom},
              'availableTo', ${regionStations.availableTo},
              'point', json_build_array(
                ST_Y(${regionStations.point}),
                ST_X(${regionStations.point})
              )
            )
          ), '[]'::json
        )
        FROM ${regionStations}
        WHERE ${regionStations.regionSnapshotId} = ${snapshotId})`,
      })
      .from(regionSnapshots)
      .where(
        and(
          eq(regionSnapshots.id, snapshotId),
          eq(regionSnapshots.regionId, regionId),
        ),
      )
      .limit(1);

    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "Region not found.", { regionId });
    }

    return new Success(result as RegionSnapshotObject);
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
 * @param ownerId - The user ID of the snapshot creator.
 * @returns A `Result<RegionSnapshotObject>`:
 * - `Success<RegionSnapshotObject>` with the created snapshot data.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if the region does not exist.
 * - `Failure` with `ErrorCodes.Fatal` if snapshot creation fails unexpectedly.
 */
export async function createSnapshot(regionId: string, params: RegionAddParameters, ownerId: string): Promise<Result<RegionSnapshotObject>> {
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
          ownerId,
          versionName: params.snapshotName,
          snapshotState: params.snapshotState ?? "wip",
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

      let stations: StationObject[] = [];
      if (params.stations.length > 0) {
        const stationCreateResult = await tx
          .insert(regionStations)
          .values(
            params.stations.map(point => ({
              regionSnapshotId: snapshot.id,
              address: point.address,
              availableFrom: point.availableFrom ?? "00:00",
              availableTo: point.availableTo ?? "23:59",
              point: [point.point[1], point.point[0]] as [number, number],
            })),
          )
          .returning();
        stations = stationCreateResult.map(s => ({
          id: s.id,
          address: s.address,
          availableFrom: s.availableFrom,
          availableTo: s.availableTo,
          point: [s.point[1], s.point[0]],
        }));
      }

      return {
        id: regionTarget.id,
        snapshotId: snapshot.id,
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
      } satisfies RegionSnapshotObject;
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
export async function copySnapshot(regionId: string, sourceSnapshotId: string, ownerId: string): Promise<Result<SnapshotItem>> {
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
          ownerId,
          snapshotState: "wip",
          regionId: snapshot.regionId,
          versionName: snapshot.versionName + " (Copy)",
          name: snapshot.name,
          color: snapshot.color,
          shapeType: snapshot.shapeType,
        })
        .returning();
      if (!newSnapshot) return tx.rollback();

      if (shape.length > 0) {
        await tx
          .insert(regionSequences)
          .values(shape.map(p => ({
            sequenceNumber: p.sequenceNumber,
            point: p.point,
            regionSnapshotId: newSnapshot.id,
          })));
      }

      if (stations.length > 0) {
        await tx
          .insert(regionStations)
          .values(stations.map(s => ({
            point: s.point,
            address: s.address,
            availableFrom: s.availableFrom,
            availableTo: s.availableTo,
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
 * Deletes a region snapshot after validation.
 *
 * Prevents deletion if:
 * - The snapshot does not exist or does not belong to the region.
 * - The snapshot is in the `"ready"` state.
 * - The snapshot is the region's currently active snapshot.
 *
 * @param regionId - The ID of the region that owns the snapshot.
 * @param snapshotId - The ID of the snapshot to delete.
 * @returns A `Result<undefined>`:
 * - `Success<undefined>` when deletion succeeds.
 * - `Failure` with `ErrorCodes.ResourceExpired` if the snapshot is not found.
 * - `Failure` with `ErrorCodes.ValidationFailure` if the snapshot cannot be deleted.
 * - `Failure` with `ErrorCodes.Fatal` on unexpected errors.
 */
export async function deleteSnapshot(regionId: string, snapshotId: string): Promise<Result<undefined>> {
  try {
    const [snapshot] = await db
      .select({ id: regionSnapshots.id, state: regionSnapshots.snapshotState })
      .from(regionSnapshots)
      .where(
        and(
          eq(regionSnapshots.id, snapshotId),
          eq(regionSnapshots.regionId, regionId),
        ),
      )
      .limit(1);
    if (!snapshot) {
      return new Failure(ErrorCodes.ResourceExpired, "No snapshot found", { regionId, snapshotId });
    }

    if (snapshot.state === "ready") {
      return new Failure(ErrorCodes.ValidationFailure, "You cannot delete this snapshot", { regionId, snapshotId });
    }

    // Prevent deleting the active snapshot
    const [parentRegion] = await db
      .select({ activeSnapshotId: region.activeSnapshotId })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);
    if (parentRegion && parentRegion.activeSnapshotId === snapshotId) {
      return new Failure(ErrorCodes.ValidationFailure, "Cannot delete the active snapshot", { regionId, snapshotId });
    }

    await db.delete(regionSnapshots)
      .where(eq(regionSnapshots.id, snapshot.id));

    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete the snapshot", { regionId, snapshotId }, e);
  }
}

/**
 * Switches a region's active snapshot to the specified snapshot and updates the region's
 * denormalized fields (`name`, `color`, `shapeType`) to match the snapshot.
 *
 * Workflow:
 * 1. Verifies the region exists.
 * 2. Verifies the target snapshot exists and is in the `"ready"` state.
 * 3. Updates the region's `activeSnapshotId`, `name`, `color`, and `shapeType`.
 * 4. Fetches and returns the resolved snapshot payload.
 *
 * @param regionId - The ID of the region to update.
 * @param snapshotId - The ID of the snapshot to activate.
 * @returns A `Result<RegionSnapshotObject>`:
 * - `Success<RegionSnapshotObject>` with the snapshot data after activation.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if region or snapshot is not found.
 * - `Failure` with `ErrorCodes.ValidationFailure` if the snapshot state is not eligible for switching.
 * - `Failure` with `ErrorCodes.Fatal` if an unexpected error occurs.
 */
export async function switchSnapshot(regionId: string, snapshotId: string): Promise<Result<RegionSnapshotObject>> {
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
      .select({
        id: regionSnapshots.id,
        state: regionSnapshots.snapshotState,
        name: regionSnapshots.name,
        color: regionSnapshots.color,
        shapeType: regionSnapshots.shapeType,
      })
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

    // Update region with snapshot fields
    await db
      .update(region)
      .set({
        activeSnapshotId: snapshotToUse.id,
        name: snapshotToUse.name,
        color: snapshotToUse.color,
        shapeType: snapshotToUse.shapeType,
      })
      .where(eq(region.id, regionId));

    const result = await unwrap(getSnapshotInformationById(regionId, snapshotToUse.id));
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to switch region snapshot.", { regionId, snapshotId }, e);
  }
}

/**
 * Retrieves all snapshots for a region.
 *
 * @param regionId - The ID of the region to fetch snapshots for.
 * @returns A `Result<SnapshotItem[]>` containing the snapshot list, or a failure.
 */
export async function getAllSnapshots(regionId: string): Promise<Result<SnapshotItem[]>> {
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
      .where(eq(regionSnapshots.regionId, regionId));

    return new Success(snapshots);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to get all the snapshots", { regionId }, e);
  }
}

/**
 * Creates a new region with an initial snapshot, including sequence points and optional stations.
 *
 * The region row is created with the provided metadata (`name`, `color`, `shapeType`),
 * then a snapshot is created and set as the active snapshot.
 *
 * @param payload - Region data to create, including metadata, points, and optional stations.
 * @param ownerId - The user ID of the region creator.
 * @returns A `Result<RegionSnapshotObject>` containing the created region snapshot, or a failure if creation fails.
 */
export async function createRegion(payload: RegionAddParameters, ownerId: string): Promise<Result<RegionSnapshotObject>> {
  try {
    const [newRegion] = await db
      .insert(region)
      .values({
        name: payload.regionName,
        color: payload.regionColor,
        shapeType: payload.regionShape,
        activeSnapshotId: "unset",
        ownerId,
      })
      .returning();
    if (!newRegion) {
      return new Failure(ErrorCodes.Fatal, "Failed to create region.", {});
    }

    // Create snapshot
    const snapshot = await unwrap(createSnapshot(newRegion.id, payload, ownerId));

    // Update the active snapshot
    await db
      .update(region)
      .set({ activeSnapshotId: snapshot.snapshotId })
      .where(eq(region.id, newRegion.id));

    return new Success(snapshot);
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
 * Updates an existing region snapshot and optionally replaces its sequence points and stations.
 *
 * If metadata fields are provided, they are patched on the snapshot row. When `params.points`
 * is provided, all existing snapshot points are deleted and recreated. When `params.stations`
 * is provided, all existing stations are deleted and recreated. The updated snapshot is then
 * reloaded and returned with coordinates normalized into `[latitude, longitude]` format.
 *
 * @param regionId - The unique identifier of the region.
 * @param snapshotId - The unique identifier of the snapshot to update.
 * @param params - The snapshot fields and/or related collections to modify.
 * @returns A `Result<RegionSnapshotObject>` containing the updated snapshot, or a failure if the update fails.
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
        ...(params.snapshotState !== undefined && { snapshotState: params.snapshotState }),
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
              availableFrom: station.availableFrom ?? "00:00",
              availableTo: station.availableTo ?? "23:59",
              point: [station.point[1], station.point[0]] as [number, number],
            })),
          );
        }
      }
    });

    const updated = await unwrap(getSnapshotInformationById(regionId, snapshotToEdit.id));
    return new Success(updated);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update region.", { regionId, params }, e);
  }
}

export async function togglePublic(regionId: string, state: boolean): Promise<Result<PublicToggleResult>> {
  try {
    const [selectedRegion] = await db
      .select({ id: region.id, activeSnapshotId: region.activeSnapshotId })
      .from(region)
      .where(eq(region.id, regionId))
      .limit(1);
    if (!selectedRegion) {
      return new Failure(ErrorCodes.ResourceNotFound, "No region found.", { regionId });
    }

    const [activeSnapshot] = await db
      .select({ snapshotState: regionSnapshots.snapshotState })
      .from(regionSnapshots)
      .where(eq(regionSnapshots.id, selectedRegion.activeSnapshotId))
      .limit(1);
    if (!activeSnapshot) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No snapshot found.",
        {
          regionId,
          snapshotId: selectedRegion.activeSnapshotId,
        },
      );
    }

    if (activeSnapshot.snapshotState !== "ready" && state) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "You can publish it only when the selected snapshot is on \"ready\" state.",
        {
          regionId,
          snapshotId: selectedRegion.activeSnapshotId,
          snapshotState: activeSnapshot.snapshotState,
        },
      );
    }

    const [update] = await db
      .update(region)
      .set({ isPublic: state })
      .where(eq(region.id, selectedRegion.id))
      .returning();

    return new Success({
      id: update.id,
      isPublic: update.isPublic,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to toggle public viewing", { regionId, state }, e);
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
  availableFrom: string;
  availableTo: string;
  point: [number, number];
}

export interface RegionBaseObject {
  id: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<PointObject>;
  stations: Array<StationObject>;
}

export type RegionListObject = Omit<RegionBaseObject,
  | "stations"
>;

export type RegionObject = RegionBaseObject & {
  activeSnapshotId: string;
  isPublic: boolean;
}

export interface RegionSnapshotObject {
  id: string;
  snapshotId: string;
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
  snapshotState?: "wip" | "for_approval" | "ready";
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<Omit<PointObject, "id">>;
  stations: Array<{
    address: string;
    point: [number, number];
    availableFrom?: string;
    availableTo?: string;
  }>;
}

export interface UpdateRegionParameters {
  snapshotName?: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  regionName?: string;
  regionColor?: string;
  regionShape?: string;
  points?: Array<Omit<PointObject, "id">>;
  stations?: Array<{
    address: string;
    point: [number, number];
    availableFrom?: string;
    availableTo?: string;
  }>;
}

export interface SnapshotItem {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  updatedAt: Date;
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}
