import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { routes, routeSnapshots, routeSequences } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";
import { unwrap } from "../one-of";

/**
 * Fetches all routes with their metadata and nested point data.
 *
 * The returned result includes each route's identifying fields plus a `points`
 * payload containing:
 * - the route polylines for outgoing and return directions
 * - ordered `goingTo` and `goingBack` point arrays with coordinates normalized
 *   into `[latitude, longitude]` format
 *
 * @returns A `Result<RouteObject[]>` wrapping either the list of routes or a failure.
 */
export async function getAllRoutes(): Promise<Result<RouteObject[]>> {
  try {
    const result = await db
      .select({
        id: routes.id,
        routeNumber: routeSnapshots.routeNumber,
        routeName: routeSnapshots.routeName,
        routeColor: routeSnapshots.routeColor,
        routeDetails: routeSnapshots.routeDetails,

        // language=text
        points: sql<RoutePoint>`
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
      .leftJoin(routeSnapshots, eq(routes.activeSnapshotId, routeSnapshots.id))
      .leftJoin(routeSequences, eq(routeSnapshots.id, routeSequences.routeSnapshotId))
      .groupBy(routes.id, routeSnapshots.id);

    return new Success(result as RouteObject[]);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch routes", {}, e);
  }
}

/**
 * Fetches a route by its ID, including active snapshot metadata and ordered route sequence points
 * for both directions (`going_to` and `going_back`).
 *
 * The query joins `routes`, `routeSnapshots`, and `routeSequences`, then builds a structured
 * `points` JSON object containing:
 * - `polylineGoingTo`
 * - `goingTo`: ordered list of points/stops
 * - `polylineGoingBack`
 * - `goingBack`: ordered list of points/stops
 *
 * @param routeId - The unique identifier of the route to retrieve.
 * @param [snapshotId] - The unique identifier of the snapshot to use. If not provided, it will use the active
 *                       selected snapshot.
 * @returns A `Result<RouteObject>`:
 * - `Success<RouteObject>` when the route exists.
 * - `Failure` with `ErrorCodes.ResourceNotFound` when no route is found.
 * - `Failure` with `ErrorCodes.Fatal` when an unexpected error occurs during fetch.
 */
export async function getRouteById(routeId: string, snapshotId?: string): Promise<Result<RouteObject>> {
  try {
    const [result] = await db
      .select({
        id: routes.id,
        routeNumber: routeSnapshots.routeNumber,
        routeName: routeSnapshots.routeName,
        routeColor: routeSnapshots.routeColor,
        routeDetails: routeSnapshots.routeDetails,

        // language=text
        points: sql<RoutePoint>`
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
      .leftJoin(routeSequences, eq(routeSnapshots.id, routeSequences.routeSnapshotId))
      .groupBy(routes.id, routeSnapshots.id);

    if (!result) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such route found.", { routeId });
    }

    return new Success(result as RouteObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch route", { routeId }, e);
  }
}

/**
 * Creates a new WIP snapshot for an existing route, persists its directional sequence points,
 * and sets the new snapshot as the route's active snapshot.
 *
 * This operation is executed in a database transaction:
 * 1. Verifies that the route exists.
 * 2. Inserts a new snapshot record.
 * 3. Inserts sequence points for `going_to` and `going_back` directions (if provided).
 * 4. Updates the route to reference the new snapshot as active.
 * 5. Returns a normalized `RouteObject` payload.
 *
 * Coordinate mapping note:
 * - Input/output points use `[lat, lng]`.
 * - Persisted DB points are stored as `[lng, lat]`.
 *
 * @param routeId - The ID of the route for which a snapshot will be created.
 * @param params - Snapshot creation payload, including route metadata, optional polylines,
 * and directional point sequences.
 * @returns A `Result<RouteObject>`:
 * - `Success<RouteObject>` with the created snapshot data when successful.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if the route does not exist.
 * - `Failure` with `ErrorCodes.Fatal` if an unexpected error occurs.
 */
export async function createSnapshot(routeId: string, params: AddRouteParameters): Promise<Result<RouteObject>> {
  try {
    const [route] = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);
    if (!route) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such route found", { routeId });
    }

    const transaction = await db.transaction(async tx => {
      // Generate a snapshot first
      const [snapshot] = await tx
        .insert(routeSnapshots)
        .values({
          versionName: params.snapshotName,
          snapshotState: "wip",
          routeId: route.id,
          routeName: params.routeName,
          routeNumber: params.routeNumber,
          routeColor: params.routeColor,
          routeDetails: params.routeDetails ?? "",
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

      // Set the current version as active
      await tx.update(routes)
        .set({ activeSnapshotId: snapshot.id })
        .where(eq(routes.id, route.id));

      return {
        id: snapshot.id,
        routeNumber: snapshot.routeNumber,
        routeName: snapshot.routeName,
        routeColor: snapshot.routeColor,
        routeDetails: snapshot.routeDetails,
        points: {
          polylineGoingTo: snapshot.polylineGoingTo,
          goingTo: sequences
            .filter(x => x.sequenceType === "going_to")
            .map(x => ({
              id: x.id,
              address: x.address,
              sequence: x.sequenceNumber,
              point: [x.point[1], x.point[0]] as [number, number],
            })),
          polylineGoingBack: snapshot.polylineGoingBack,
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
 * @returns A `Result<SnapshotItem>`:
 * - `Success<SnapshotItem>` with the new snapshot `{ id, name, state }`.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if the source snapshot is not found.
 * - `Failure` with `ErrorCodes.Fatal` if cloning fails unexpectedly.
 */
export async function copySnapshot(routeId: string, sourceSnapshotId: string): Promise<Result<SnapshotItem>> {
  try {
    const [snapshot] = await db
      .select()
      .from(routeSnapshots)
      .where(
        and(
          eq(routeSnapshots.id, routeId),
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
          snapshotState: "wip",
          routeId: snapshot.routeId,
          versionName: snapshot.versionName + " (Copy)",
          routeNumber: snapshot.routeNumber,
          routeName: snapshot.routeName,
          routeColor: snapshot.routeColor,
          routeDetails: snapshot.routeDetails,
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
 * Switches a route's active snapshot to a specified snapshot version.
 *
 * Validation flow:
 * 1. Confirms the target route exists.
 * 2. Confirms the target snapshot exists and belongs to that route.
 * 3. Ensures the snapshot is in `"ready"` state before going live.
 *
 * If all checks pass, the route's `activeSnapshotId` is updated and the latest route
 * data is returned.
 *
 * @param routeId - The ID of the route to update.
 * @param snapshotId - The ID of the snapshot to activate.
 * @returns A `Result<RouteData>`:
 * - `Success<RouteData>` with the updated active route data.
 * - `Failure` with `ErrorCodes.ResourceNotFound` if route or snapshot is missing.
 * - `Failure` with `ErrorCodes.ValidationFailure` if snapshot is not in `"ready"` state.
 * - `Failure` with `ErrorCodes.Fatal` if an unexpected error occurs.
 */
export async function switchSnapshot(routeId: string, snapshotId: string): Promise<Result<RouteData>> {
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
        routeName: routeSnapshots.routeName,
        routeNumber: routeSnapshots.routeNumber,
        routeColor: routeSnapshots.routeColor,
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

    // Swap
    await db
      .update(routes)
      .set({ activeSnapshotId: snapshotToUse.id })
      .where(eq(routes.id, routeToEdit.id));

    const route = await unwrap(getRouteById(routeToEdit.id));
    return new Success(route);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to switch versions", { routeId, snapshotId }, e);
  }
}

/**
 * Creates a new route and its associated route sequences inside a single transaction.
 *
 * The route record is inserted first, then all `going_to` and `going_back` points are
 * stored as route sequences. Coordinate order is normalized before persistence, and the
 * returned object restores coordinates in `[latitude, longitude]` format.
 *
 * @param params - Route data to create, including metadata, optional polylines, and route points.
 * @returns A `Result<RouteObject>` containing the newly created route, or a failure if creation fails.
 */
export async function addRoute(params: AddRouteParameters): Promise<Result<RouteObject>> {
  try {
    const [route] = await db
      .insert(routes)
      .values({
        activeSnapshotId: "unset",
      })
      .returning();
    if (!route) {
      return new Failure(ErrorCodes.Fatal, "Failed to create a route", { params });
    }

    // Create the snapshot
    const snapshot = await unwrap(createSnapshot(route.id, params));

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
 * @returns A `Result<RouteObject>` containing the updated route, or a failure if the update fails.
 */
export async function updateRouteSnapshot(
  routeId: string,
  snapshotId: string,
  params: UpdateRouteParameters,
): Promise<Result<RouteObject>> {
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
        ...(params.routeNumber !== undefined && { routeNumber: params.routeNumber }),
        ...(params.routeName !== undefined && { routeName: params.routeName }),
        ...(params.routeColor !== undefined && { routeColor: params.routeColor }),
        ...(params.routeDetails !== undefined && { routeDetails: params.routeDetails }),
        ...(params.polylineGoingTo !== undefined && { polylineGoingTo: params.polylineGoingTo }),
        ...(params.polylineGoingBack !== undefined && { polylineGoingBack: params.polylineGoingBack }),
      };

      if (Object.keys(routePatch).length > 0) {
        // Update and grab the fresh row
        const [routeData] = await tx
          .update(routeSnapshots)
          .set(routePatch)
          .where(eq(routeSnapshots.id, snapshotToEdit.id))
          .returning();

        if (!routeData) tx.rollback();
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
    const result = await unwrap(getRouteById(routeId, snapshotId));
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update route", { routeId, params }, e);
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
  routeNumber: string;
  routeName: string;
  routeColor: string;
  routeDetails: string;
  polylineGoingTo: string;
  polylineGoingBack: string;
  points: {
    goingTo: Array<Omit<PointObject, "id">>;
    goingBack: Array<Omit<PointObject, "id">>;
  }
}

export interface UpdateRouteParameters {
  snapshotName?: string;
  routeNumber?: string;
  routeName?: string;
  routeColor?: string;
  routeDetails?: string;
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
  routeDetails: string;
  points: RoutePoint;
}

export type RouteData = Omit<RouteObject, "points">;

export interface SnapshotItem {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  updatedAt: Date;
}

export interface RoutePoint {
  polylineGoingTo: string;
  goingTo: Array<PointObject>;
  polylineGoingBack: string;
  goingBack: Array<PointObject>;
}
