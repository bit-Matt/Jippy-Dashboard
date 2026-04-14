import {and, count, eq, sql} from "drizzle-orm";

import { db } from "@/lib/db";
import { routes, routeSnapshots, routeSequences, vehicleTypes } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";
import { unwrap } from "@/lib/one-of";

/**
 * Fetches all routes from the denormalized `routes` table.
 *
 * Returns lightweight route objects without snapshot metadata or point data.
 * Use `forPublic` to filter for publicly visible routes.
 *
 * @returns A `Result<RouteObject[]>` wrapping either the list of routes or a failure.
 */
export async function getAllRoutes(forPublic: boolean = false): Promise<Result<RouteListItem[] | RouteBaseObject[]>> {
  try {
    // For public APIs
    if (forPublic) {
      const result = await db
        .select({
          id: routes.id,
          routeNumber: routes.routeNumber,
          routeName: routes.routeName,
          routeColor: routes.routeColor,
          routeDetails: routes.routeDetails,
          availableFrom: routes.availableFrom,
          availableTo: routes.availableTo,
          vehicleTypeId: routes.vehicleTypeId,
          vehicleTypeName: vehicleTypes.name,
          polylineGoingTo: routes.polylineGoingTo,
          polylineGoingBack: routes.polylineGoingBack,
        })
        .from(routes)
        .leftJoin(vehicleTypes, eq(vehicleTypes.id, routes.vehicleTypeId))
        .where(eq(routes.isPublic, true));

      const mapping: RouteBaseObject[] = result.map(x => ({
        id: x.id,
        routeNumber: x.routeNumber,
        routeName: x.routeName,
        routeColor: x.routeColor,
        routeDetails: x.routeDetails,
        polylines: {
          to: x.polylineGoingTo,
          back: x.polylineGoingBack,
        },
        availability: {
          from: x.availableFrom,
          to: x.availableTo,
        },
        vehicle: {
          id: x.vehicleTypeId,
          name: x.vehicleTypeName!,
        },
      }));

      return new Success(mapping);
    }

    // For Dashboard listing
    const result = await db
      .select({
        id: routes.id,
        activeSnapshotId: routes.activeSnapshotId,
        routeNumber: routes.routeNumber,
        routeName: routes.routeName,
        routeColor: routes.routeColor,
        polylineGoingTo: routes.polylineGoingTo,
        polylineGoingBack: routes.polylineGoingBack,
      })
      .from(routes)
      .leftJoin(vehicleTypes, eq(vehicleTypes.id, routes.vehicleTypeId));

    const mapping: RouteListItem[] = result.map(x => ({
      id: x.id,
      activeSnapshotId: x.activeSnapshotId,
      routeNumber: x.routeNumber,
      routeName: x.routeName,
      routeColor: x.routeColor,
      polylines: {
        to: x.polylineGoingTo,
        back: x.polylineGoingBack,
      },
    }));

    return new Success(mapping);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch routes", {}, e);
  }
}

export async function getRouteById(routeId: string): Promise<Result<RouteObject>> {
  try {
    const [result] = await db
      .select({
        id: routes.id,
        activeSnapshotId: routes.activeSnapshotId,
        routeNumber: routes.routeNumber,
        routeName: routes.routeName,
        routeColor: routes.routeColor,
        routeDetails: routes.routeDetails,
        availableFrom: routes.availableFrom,
        availableTo: routes.availableTo,
        vehicleTypeId: routes.vehicleTypeId,
        vehicleTypeName: vehicleTypes.name,
        vehicleTypeRequiresRoute: vehicleTypes.requiresRoute,
        polylineGoingTo: routes.polylineGoingTo,
        polylineGoingBack: routes.polylineGoingBack,
        isPublic: routes.isPublic,
      })
      .from(routes)
      .where(eq(routes.id, routeId))
      .leftJoin(vehicleTypes, eq(vehicleTypes.id, routes.vehicleTypeId))
      .limit(1);

    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such route found.", { routeId });
    }

    return new Success({
      id: result.id,
      activeSnapshotId: result.activeSnapshotId,
      routeNumber: result.routeNumber,
      routeName: result.routeName,
      routeColor: result.routeColor,
      routeDetails: result.routeDetails,
      isPublic: result.isPublic,
      availability: {
        from: result.availableFrom,
        to: result.availableTo,
      },
      vehicle: {
        id: result.vehicleTypeId,
        name: result.vehicleTypeName!,
      },
      polylines: {
        to: result.polylineGoingTo,
        back: result.polylineGoingBack,
      },
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch route", { routeId }, e);
  }
}

export async function getRouteSnapshotById(routeId: string, snapshotId?: string): Promise<Result<RouteSnapshotObject>> {
  try {
    const [result] = await db
      .select({
        id: routes.id,
        isPublic: routes.isPublic,
        activeSnapshotId: routes.activeSnapshotId,
        snapshotName: routeSnapshots.versionName,
        snapshotState: routeSnapshots.snapshotState,
        routeNumber: routeSnapshots.routeNumber,
        routeName: routeSnapshots.routeName,
        routeColor: routeSnapshots.routeColor,
        routeDetails: routeSnapshots.routeDetails,
        availableFrom: routeSnapshots.availableFrom,
        availableTo: routeSnapshots.availableTo,
        vehicleTypeId: routeSnapshots.vehicleTypeId,
        vehicleTypeName: vehicleTypes.name,
        vehicleTypeRequiresRoute: vehicleTypes.requiresRoute,

        // language=text
        points: sql<RoutePoint & { polylineGoingTo: string; polylineGoingBack: string }>`
        json_build_object(
          'polylineGoingTo', ${routeSnapshots.polylineGoingTo},
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
          'polylineGoingBack', ${routeSnapshots.polylineGoingBack},
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
      .where(eq(routes.id, routeId))
      .leftJoin(routeSnapshots, eq(routeSnapshots.id, snapshotId ? snapshotId : routes.activeSnapshotId))
      .leftJoin(vehicleTypes, eq(routeSnapshots.vehicleTypeId, vehicleTypes.id))
      .leftJoin(routeSequences, eq(routeSnapshots.id, routeSequences.routeSnapshotId))
      .groupBy(routes.id, routeSnapshots.id, vehicleTypes.id);

    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such route found.", { routeId });
    }

    const mapped: RouteSnapshotObject = {
      id: result.id,
      activeSnapshotId: result.activeSnapshotId ?? "",
      snapshotName: result.snapshotName ?? "",
      snapshotState: result.snapshotState ?? "",
      routeNumber: result.routeNumber ?? "",
      routeName: result.routeName ?? "",
      routeColor: result.routeColor ?? "",
      routeDetails: result.routeDetails ?? "",
      isPublic: result.isPublic,
      availability: {
        from: result.availableFrom ?? "",
        to: result.availableTo ?? "",
      },
      vehicle: {
        id: result.vehicleTypeId ?? "",
        name: result.vehicleTypeName ?? "",
      },
      polylines: {
        to: result.points?.polylineGoingTo ?? "",
        back: result.points?.polylineGoingBack ?? "",
      },
      points: {
        goingTo: result.points?.goingTo ?? [],
        goingBack: result.points?.goingBack ?? [],
      },
    };

    return new Success(mapped);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch route", { routeId }, e);
  }
}

/**
 * Fetches sequence points for a specific route snapshot.
 *
 * Use this when editing route geometry. This keeps list responses lightweight by
 * loading heavy point payloads only on demand.
 *
 * @param routeId - The ID of the route that owns the snapshot.
 * @param snapshotId - The snapshot ID whose directional points should be loaded.
 * @returns A `Result<RoutePoint>` with ordered `goingTo` / `goingBack` sequence
 * points and their encoded polylines, or a failure when the snapshot cannot be
 * resolved.
 */
export async function getSnapshotPoints(routeId: string, snapshotId: string): Promise<Result<RoutePoint>> {
  try {
    const [result] = await db
      .select({
        // language=text
        points: sql<RoutePoint>`
          json_build_object(
            'goingTo', COALESCE(
              json_agg(
                json_build_object(
                  'id', ${routeSequences.id},
                  'sequence', ${routeSequences.sequenceNumber},
                  'address', ${routeSequences.address},
                  'point', json_build_array(
                    ST_Y(${routeSequences.point}),
                    ST_X(${routeSequences.point})
                  )
                ) ORDER BY ${routeSequences.sequenceNumber} ASC
              ) FILTER (WHERE ${routeSequences.sequenceType} = 'going_to'), '[]'::json
            ),
            'goingBack', COALESCE(
              json_agg(
                json_build_object(
                  'id', ${routeSequences.id},
                  'sequence', ${routeSequences.sequenceNumber},
                  'address', ${routeSequences.address},
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
      .from(routeSnapshots)
      .where(
        and(
          eq(routeSnapshots.id, snapshotId),
          eq(routeSnapshots.routeId, routeId),
        ),
      )
      .leftJoin(routeSequences, eq(routeSnapshots.id, routeSequences.routeSnapshotId))
      .groupBy(routeSnapshots.id);

    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such snapshot found", { routeId, snapshotId });
    }

    return new Success(result.points);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch snapshot points", { routeId, snapshotId }, e);
  }
}

/**
 * Creates a new WIP snapshot for an existing route and persists its directional sequence points.
 *
 * This operation is executed in a database transaction:
 * 1. Verifies that the route exists.
 * 2. Inserts a new snapshot record.
 * 3. Inserts sequence points for `going_to` and `going_back` directions (if provided).
 * 4. Returns a normalized `RouteSnapshotObject` payload.
 *
 * Coordinate mapping note:
 * - Input/output points use `[lat, lng]`.
 * - Persisted DB points are stored as `[lng, lat]`.
 *
 * @param routeId - The ID of the route for which a snapshot will be created.
 * @param params - Snapshot creation payload, including route metadata, optional polylines,
 * and directional point sequences.
 * @param ownerId - The owner of the snapshot.
 * @returns A `Result<RouteSnapshotObject>`:
 * - `Success<RouteSnapshotObject>` with the created snapshot data when successful.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if the route does not exist.
 * - `Failure` with `ErrorCodes.Fatal` if an unexpected error occurs.
 */
export async function createSnapshot(routeId: string, params: AddRouteParameters, ownerId: string): Promise<Result<RouteSnapshotObject>> {
  try {
    const [route] = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!route) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such route found", { routeId });
    }

    const [vehicleType] = await db
      .select({ id: vehicleTypes.id })
      .from(vehicleTypes)
      .where(eq(vehicleTypes.id, params.vehicleTypeId))
      .limit(1);
    if (!vehicleType) {
      return new Failure(ErrorCodes.ValidationFailure, "Vehicle type not found.", {
        routeId,
        vehicleTypeId: params.vehicleTypeId,
      });
    }

    const transaction = await db.transaction(async tx => {
      // Generate a snapshot first
      const [snapshot] = await tx
        .insert(routeSnapshots)
        .values({
          ownerId,
          versionName: params.snapshotName,
          snapshotState: params.snapshotState ?? "wip",
          routeId: route.id,
          routeName: params.routeName,
          routeNumber: params.routeNumber,
          routeColor: params.routeColor,
          routeDetails: params.routeDetails ?? "",
          availableFrom: params.availableFrom ?? "00:00",
          availableTo: params.availableTo ?? "23:59",
          vehicleTypeId: params.vehicleTypeId,
          polylineGoingTo: params.polylineGoingTo ?? "",
          polylineGoingBack: params.polylineGoingBack ?? "",
        })
        .returning();
      if (!snapshot) return tx.rollback();

      // Then generate the route sequences
      const newPoints = [
        ...params.points.goingTo.map(m => ({
          routeSnapshotId: snapshot.id,
          sequenceType: "going_to" as const,
          sequenceNumber: m.sequence,
          address: m.address,
          point: [m.point[1], m.point[0]] as [number, number],
        })),
        ...params.points.goingBack.map(m => ({
          routeSnapshotId: snapshot.id,
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
        id: snapshot.id,
        activeSnapshotId: snapshot.id,
        snapshotName: snapshot.versionName,
        snapshotState: snapshot.snapshotState,
        routeNumber: snapshot.routeNumber,
        routeName: snapshot.routeName,
        routeColor: snapshot.routeColor,
        routeDetails: snapshot.routeDetails,
        isPublic: false,
        availability: {
          from: snapshot.availableFrom,
          to: snapshot.availableTo,
        },
        vehicle: {
          id: snapshot.vehicleTypeId,
          name: "",
        },
        polylines: {
          to: snapshot.polylineGoingTo,
          back: snapshot.polylineGoingBack,
        },
        points: {
          goingTo: sequences
            .filter(x => x.sequenceType === "going_to")
            .map(x => ({
              id: x.id,
              address: x.address,
              sequence: x.sequenceNumber,
              point: [x.point[1], x.point[0]] as [number, number],
            })),
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

    return new Success(transaction);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create snapshot", { routeId, params }, e);
  }
}

/**
 * Creates a new snapshot by cloning an existing snapshot (including all sequence points)
 * for the given route.
 *
 * The operation:
 * 1. Finds the source snapshot for the route.
 * 2. Loads all route sequence points from the source snapshot.
 * 3. Creates a new snapshot in `"wip"` state with copied metadata and `"(Copy)"` suffix.
 * 4. Duplicates all source sequence records into the new snapshot.
 *
 * Executed inside a database transaction to ensure atomicity.
 *
 * @param routeId - The ID of the route that owns the snapshot.
 * @param sourceSnapshotId - The ID of the snapshot to copy.
 * @param ownerId - The owner of the snapshot
 * @returns A `Result<SnapshotItem>`:
 * - `Success<SnapshotItem>` with the new snapshot `{ id, name, state }`.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if the source snapshot is not found.
 * - `Failure` with `ErrorCodes.Fatal` if cloning fails unexpectedly.
 */
export async function copySnapshot(routeId: string, sourceSnapshotId: string, ownerId: string): Promise<Result<SnapshotItem>> {
  try {
    const [snapshot] = await db
      .select()
      .from(routeSnapshots)
      .where(
        and(
          eq(routeSnapshots.id, sourceSnapshotId),
          eq(routeSnapshots.routeId, routeId),
        ),
      )
      .limit(1);
    if (!snapshot) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such snapshot found.", { routeId });
    }

    // Copy the snapshot value
    const points = await db
      .select()
      .from(routeSequences)
      .where(eq(routeSequences.routeSnapshotId, snapshot.id));

    // Create a snapshot
    const result = await db.transaction(async tx => {
      const [newSnapshot] = await tx
        .insert(routeSnapshots)
        .values({
          ownerId,
          snapshotState: "wip",
          routeId: snapshot.routeId,
          versionName: snapshot.versionName + " (Copy)",
          routeNumber: snapshot.routeNumber,
          routeName: snapshot.routeName,
          routeColor: snapshot.routeColor,
          routeDetails: snapshot.routeDetails,
          availableFrom: snapshot.availableFrom,
          availableTo: snapshot.availableTo,
          vehicleTypeId: snapshot.vehicleTypeId,
          polylineGoingTo: snapshot.polylineGoingTo,
          polylineGoingBack: snapshot.polylineGoingBack,
        })
        .returning();
      if (!newSnapshot) {
        return tx.rollback();
      }

      await tx
        .insert(routeSequences)
        .values(points.map(point => ({
          routeSnapshotId: newSnapshot.id,
          sequenceType: point.sequenceType,
          sequenceNumber: point.sequenceNumber,
          address: point.address,
          point: point.point,
        })));

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
    return new Failure(ErrorCodes.Fatal, "Failed to copy snapshot", { routeId, sourceSnapshotId }, e);
  }
}

export async function deleteSnapshot(routeId: string, snapshotId: string): Promise<Result<undefined>> {
  try {
    const [snapshot] = await db
      .select({ id: routeSnapshots.id, state: routeSnapshots.snapshotState })
      .from(routeSnapshots)
      .where(
        and(
          eq(routeSnapshots.id, snapshotId),
          eq(routeSnapshots.routeId, routeId),
        ),
      )
      .limit(1);
    if (!snapshot) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such snapshot found", { routeId, snapshotId });
    }

    if (snapshot.state === "ready") {
      return new Failure(ErrorCodes.ValidationFailure, "You cannot delete this snapshot.", { snapshotId });
    }

    await db.delete(routeSnapshots)
      .where(eq(routeSnapshots.id, snapshot.id));

    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete snapshot", { routeId, snapshotId }, e);
  }
}

export async function isAllContentDeletableByContributor(routeId: string): Promise<Result<boolean>> {
  try {
    const [undeletable] = await db
      .select({ count: count() })
      .from(routeSnapshots)
      .where(
        and(
          eq(routeSnapshots.routeId, routeId),
          eq(routeSnapshots.snapshotState, "ready"),
        ),
      );
    return new Success(undeletable.count === 0);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to count total deletable content", {}, e);
  }
}

/**
 * Retrieves all snapshots associated with a route, returned as lightweight snapshot items.
 *
 * Results include each snapshot's identifier, version name, and state, ordered by
 * the snapshot `updatedAt` timestamp.
 *
 * @param routeId - The ID of the route whose snapshots should be fetched.
 * @returns A `Result<SnapshotItem[]>`:
 * - `Success<SnapshotItem[]>` containing the list of snapshots (empty if none exist).
 * - `Failure` with `ErrorCodes.Fatal` if the query fails.
 */
export async function getAllSnapshotByRouteId(routeId: string): Promise<Result<SnapshotItem[]>> {
  try {
    const snapshots = await db
      .select({
        id: routeSnapshots.id,
        name: routeSnapshots.versionName,
        state: routeSnapshots.snapshotState,
        createdOn: routeSnapshots.createdAt,
        updatedAt: routeSnapshots.updatedAt,
      })
      .from(routeSnapshots)
      .where(eq(routeSnapshots.routeId, routeId))
      .orderBy(routeSnapshots.updatedAt);

    return new Success(snapshots as SnapshotItem[]);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to get all snapshots", { routeId }, e);
  }
}

/**
 * Switches a route's active snapshot to a specified snapshot version and syncs
 * denormalized fields from the snapshot into the `routes` table.
 *
 * Validation flow:
 * 1. Confirms the target route exists.
 * 2. Confirms the target snapshot exists and belongs to that route.
 * 3. Ensures the snapshot is in `"ready"` state before going live.
 *
 * If all checks pass, the route row is updated with the snapshot's metadata
 * (`vehicleTypeId`, `routeNumber`, `routeName`, `routeColor`, `routeDetails`,
 * `availableFrom`, `availableTo`, `polylineGoingTo`, `polylineGoingBack`) and
 * `activeSnapshotId`.
 *
 * @param routeId - The ID of the route to update.
 * @param snapshotId - The ID of the snapshot to activate.
 * @returns A `Result<SwitchSnapshotResult>`:
 * - `Success<SwitchSnapshotResult>` with `{ id, activeSnapshotId }`.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if route or snapshot is missing.
 * - `Failure` with `ErrorCodes.ValidationFailure` if snapshot is not in `"ready"` state.
 * - `Failure` with `ErrorCodes.Fatal` if an unexpected error occurs.
 */
export async function switchSnapshot(routeId: string, snapshotId: string): Promise<Result<SwitchSnapshotResult>> {
  try {
    const [routeToEdit] = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!routeToEdit) {
      return new Failure(ErrorCodes.ResourceNotFound, "Route cannot be found", { routeId, snapshotId });
    }

    // Find the snapshot to use
    const [snapshotToUse] = await db
      .select({
        id: routeSnapshots.id,
        routeId: routeSnapshots.routeId,
        vehicleTypeId: routeSnapshots.vehicleTypeId,
        routeName: routeSnapshots.routeName,
        routeNumber: routeSnapshots.routeNumber,
        routeColor: routeSnapshots.routeColor,
        routeDetails: routeSnapshots.routeDetails,
        availableFrom: routeSnapshots.availableFrom,
        availableTo: routeSnapshots.availableTo,
        polylineGoingTo: routeSnapshots.polylineGoingTo,
        polylineGoingBack: routeSnapshots.polylineGoingBack,
        state: routeSnapshots.snapshotState,
      })
      .from(routeSnapshots)
      .where(
        and(
          eq(routeSnapshots.id, snapshotId),
          eq(routeSnapshots.routeId, routeToEdit.id),
        ),
      )
      .limit(1);
    if (!snapshotToUse) {
      return new Failure(ErrorCodes.ResourceNotFound, "Snapshot cannot be found", { routeId, snapshotId });
    }

    // Avoid swapping to non-ready state
    if (snapshotToUse.state !== "ready") {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "This version cannot be used for live",
        { routeId, snapshotId, snapshotToUse, routeToEdit },
      );
    }

    // Swap — sync all denormalized fields from the snapshot
    const [result] = await db
      .update(routes)
      .set({
        activeSnapshotId: snapshotToUse.id,
        vehicleTypeId: snapshotToUse.vehicleTypeId,
        routeNumber: snapshotToUse.routeNumber,
        routeName: snapshotToUse.routeName,
        routeColor: snapshotToUse.routeColor,
        routeDetails: snapshotToUse.routeDetails,
        availableFrom: snapshotToUse.availableFrom,
        availableTo: snapshotToUse.availableTo,
        polylineGoingTo: snapshotToUse.polylineGoingTo,
        polylineGoingBack: snapshotToUse.polylineGoingBack,
      })
      .where(eq(routes.id, routeToEdit.id))
      .returning();

    return new Success({
      id: routeToEdit.id,
      activeSnapshotId: result.activeSnapshotId,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to switch versions", { routeId, snapshotId }, e);
  }
}

/**
 * Creates a new route with denormalized snapshot fields and its associated route
 * sequences inside a single transaction.
 *
 * The route record is inserted with all denormalized metadata from `params`
 * (`vehicleTypeId`, `routeNumber`, `routeName`, `routeColor`, `routeDetails`,
 * `availableFrom`, `availableTo`, `polylineGoingTo`, `polylineGoingBack`), then a
 * snapshot is created and set as active. Coordinate order is normalized before
 * persistence, and the returned object restores coordinates in `[latitude, longitude]`
 * format.
 *
 * @param params - Route data to create, including metadata, polylines, and route points.
 * @param ownerId - The owner of the parameter
 * @returns A `Result<RouteSnapshotObject>` containing the newly created route, or a failure if creation fails.
 */
export async function addRoute(params: AddRouteParameters, ownerId: string): Promise<Result<RouteSnapshotObject>> {
  try {
    const [route] = await db
      .insert(routes)
      .values({
        activeSnapshotId: "00000000-0000-0000-0000-000000000000",
        ownerId,
        vehicleTypeId: params.vehicleTypeId,
        routeNumber: params.routeNumber,
        routeName: params.routeName,
        routeColor: params.routeColor,
        routeDetails: params.routeDetails ?? "",
        availableFrom: params.availableFrom ?? "00:00",
        availableTo: params.availableTo ?? "23:59",
        polylineGoingTo: params.polylineGoingTo ?? "",
        polylineGoingBack: params.polylineGoingBack ?? "",
      })
      .returning();
    if (!route) {
      return new Failure(ErrorCodes.Fatal, "Failed to create a route", { params });
    }

    // Create the snapshot
    const snapshot = await unwrap(createSnapshot(route.id, params, ownerId));

    // Apply the snapshot as the active state:
    await db.update(routes)
      .set({ activeSnapshotId: snapshot.id })
      .where(eq(routes.id, route.id));

    return new Success({
      ...snapshot,
      id: route.id,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to add route", params, e);
  }
}

/**
 * Deletes a route by its identifier.
 *
 * First verifies that the route exists, then removes it from the database.
 *
 * @param routeId - The unique identifier of the route to delete.
 * @returns A `Result<null>` indicating success, not found, or a fatal failure.
 */
export async function removeRoute(routeId: string): Promise<Result<null>> {
  try {
    const [route] = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!route) {
      return new Failure(ErrorCodes.ResourceNotFound, "Route not found", { routeId });
    }

    await db.delete(routes).where(eq(routes.id, routeId));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete route", { routeId }, e);
  }
}

/**
 * Updates an existing route snapshot and optionally replaces its route points.
 *
 * If route metadata fields are provided, they are patched on the route row.
 * If `params.points` is provided, all existing sequences for the route are deleted
 * and recreated. If points are not provided, the current sequences are fetched so
 * the returned object still includes the complete route structure.
 *
 * All stored coordinates are normalized before persistence and restored to
 * `[latitude, longitude]` format in the response.
 *
 * @param routeId - The unique identifier of the route to update.
 * @param snapshotId - The unique identifier of the snapshot to update.
 * @param params - The route fields and/or point collections to modify.
 * @returns A `Result<RouteSnapshotObject>` containing the updated route, or a failure if the update fails.
 */
export async function updateRouteSnapshot(
  routeId: string,
  snapshotId: string,
  params: UpdateRouteParameters,
): Promise<Result<RouteSnapshotObject>> {
  try {
    // Check if the snapshot is editable
    const [snapshotToEdit] = await db
      .select({ id: routeSnapshots.id, state: routeSnapshots.snapshotState })
      .from(routeSnapshots)
      .where(
        and(
          eq(routeSnapshots.routeId, routeId),
          eq(routeSnapshots.id, snapshotId),
        ),
      )
      .limit(1);
    if (!snapshotToEdit) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No such snapshot found",
        { routeId, snapshotId, params },
      );
    }

    if (snapshotToEdit.state === "ready") {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Snapshot is not editable. Create a new copy and edit.",
        { routeId, snapshotId, snapshotToEdit, params },
      );
    }

    await db.transaction(async (tx) => {
      const routePatch = {
        ...(params.snapshotName !== undefined && { versionName: params.snapshotName }),
        ...(params.snapshotState !== undefined && { snapshotState: params.snapshotState }),
        ...(params.routeNumber !== undefined && { routeNumber: params.routeNumber }),
        ...(params.routeName !== undefined && { routeName: params.routeName }),
        ...(params.routeColor !== undefined && { routeColor: params.routeColor }),
        ...(params.routeDetails !== undefined && { routeDetails: params.routeDetails }),
        ...(params.availableFrom !== undefined && { availableFrom: params.availableFrom }),
        ...(params.availableTo !== undefined && { availableTo: params.availableTo }),
        ...(params.polylineGoingTo !== undefined && { polylineGoingTo: params.polylineGoingTo }),
        ...(params.polylineGoingBack !== undefined && { polylineGoingBack: params.polylineGoingBack }),
      };

      // Check if the vehicle type specified do exist. If not, just don't bother updating it.
      // Idk, maybe we should just fail it or just ignore it, for now we'll just ignore it.
      let vehicleTypeId: string | null = null;
      if (params.vehicleTypeId) {
        const [vehicleToUse] = await tx
          .select({ id: vehicleTypes.id })
          .from(vehicleTypes)
          .where(
            and(
              eq(vehicleTypes.id, params.vehicleTypeId),
              eq(vehicleTypes.requiresRoute, true),
            ),
          );

        if (vehicleToUse) vehicleTypeId = vehicleToUse.id;
      }

      if (Object.keys(routePatch).length > 0) {
        // Update and grab the fresh row
        const [routeData] = await tx
          .update(routeSnapshots)
          .set({
            ...routePatch,
            ...(vehicleTypeId !== null ? { vehicleTypeId } : {}),
          })
          .where(eq(routeSnapshots.id, snapshotToEdit.id))
          .returning();

        if (!routeData) tx.rollback();

        // There's this synchronization issue on the main route table when the snapshot is updated. This is true only
        // for routes with an active snapshot that is not marked as ready and is unpublished.
        await tx.update(routes)
          .set({
            ...routePatch,
            ...(vehicleTypeId !== null ? { vehicleTypeId } : {}),
          })
          .where(
            and(
              eq(routes.id, routeData.routeId),
              eq(routes.activeSnapshotId, routeData.id),
            ),
          );
      }

      if (params.points) {
        // Delete old points
        await tx.delete(routeSequences).where(eq(routeSequences.routeSnapshotId, snapshotToEdit.id));

        const totalExpected = params.points.goingTo.length + params.points.goingBack.length;
        if (totalExpected > 0) {
          const newPoints = [
            ...params.points.goingTo.map(m => ({
              routeSnapshotId: snapshotToEdit.id,
              sequenceType: "going_to" as const,
              sequenceNumber: m.sequence,
              address: m.address,
              point: [m.point[1], m.point[0]] as [number, number],
            })),
            ...params.points.goingBack.map(m => ({
              routeSnapshotId: snapshotToEdit.id,
              sequenceType: "going_back" as const,
              sequenceNumber: m.sequence,
              address: m.address,
              point: [m.point[1], m.point[0]] as [number, number],
            })),
          ];

          await tx.insert(routeSequences).values(newPoints);
        }
      }
    });

    // Refetch
    const result = await unwrap(getRouteSnapshotById(routeId, snapshotId));
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update route", { routeId, params }, e);
  }
}

export async function togglePublic(routeId: string, state: boolean): Promise<Result<PublicToggleResult>> {
  try {
    const [selectedRoutes] = await db
      .select({ id: routes.id, activeSnapshotId: routes.activeSnapshotId })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!selectedRoutes) {
      return new Failure(ErrorCodes.ResourceNotFound, "No route found.", { routeId });
    }

    const [activeSnapshot] = await db
      .select({ snapshotState: routeSnapshots.snapshotState })
      .from(routeSnapshots)
      .where(eq(routeSnapshots.id, selectedRoutes.activeSnapshotId))
      .limit(1);
    if (!activeSnapshot) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "No snapshot found.",
        {
          routeId,
          snapshotId: selectedRoutes.activeSnapshotId,
        },
      );
    }

    if (activeSnapshot.snapshotState !== "ready" && state) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "You can publish it only when the selected snapshot is on \"ready\" state.",
        {
          routeId,
          snapshotId: selectedRoutes.activeSnapshotId,
          snapshotState: activeSnapshot.snapshotState,
        },
      );
    }

    const [update] = await db
      .update(routes)
      .set({ isPublic: state })
      .where(eq(routes.id, selectedRoutes.id))
      .returning();

    return new Success({
      id: update.id,
      isPublic: update.isPublic,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to toggle public viewing", { routeId, state }, e);
  }
}

export interface PointObject {
  id: string;
  sequence: number;
  address: string;
  point: [number, number];
}

export interface AddRouteParameters {
  snapshotName: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  routeNumber: string;
  routeName: string;
  routeColor: string;
  routeDetails: string;
  vehicleTypeId: string;
  availableFrom?: string;
  availableTo?: string;
  polylineGoingTo: string;
  polylineGoingBack: string;
  points: {
    goingTo: Array<Omit<PointObject, "id">>;
    goingBack: Array<Omit<PointObject, "id">>;
  }
}

export interface UpdateRouteParameters {
  snapshotName?: string;
  snapshotState?: "wip" | "for_approval" | "ready";
  routeNumber?: string;
  routeName?: string;
  routeColor?: string;
  routeDetails?: string;
  vehicleTypeId?: string;
  availableFrom?: string;
  availableTo?: string;
  polylineGoingTo?: string;
  polylineGoingBack?: string;
  points?: {
    goingTo: Array<Omit<PointObject, "id">>;
    goingBack: Array<Omit<PointObject, "id">>;
  };
}

export interface RouteBaseObject {
  id: string;
  routeNumber: string;
  routeName: string;
  routeColor: string;
  routeDetails: string;
  availability: {
    from: string;
    to: string;
  }
  vehicle: {
    id: string;
    name: string;
  }
  polylines: {
    to: string;
    back: string;
  }
}

export type RouteObject = RouteBaseObject & {
  activeSnapshotId: string;
  isPublic: boolean;
}

export type RouteListItem = Omit<RouteBaseObject,
  | "availability"
  | "vehicle"
  | "routeDetails"
>;

export interface RouteSnapshotObject extends RouteObject {
  snapshotName: string;
  snapshotState: string;
  points: RoutePoint;
}

export interface SnapshotItem {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  updatedAt: Date;
}

export interface RoutePoint {
  goingTo: Array<PointObject>;
  goingBack: Array<PointObject>;
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}

export interface SwitchSnapshotResult {
  id: string;
  activeSnapshotId: string;
}
