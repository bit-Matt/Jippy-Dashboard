import {and, eq, sql} from "drizzle-orm";

import {db} from "@/lib/db";
import {roadClosurePoints, roadClosures, roadClosureSnapshots} from "@/lib/db/schema";
import {ErrorCodes, Failure, Result, Success} from "@/lib/one-of/types";
import {unwrap} from "@/lib/one-of";

export async function getAllClosures(): Promise<Result<ClosureObject[]>> {
  try {
    const result = await db
      .select({
        id: roadClosures.id,
        activeSnapshotId: roadClosureSnapshots.id,
        versionName: roadClosureSnapshots.versionName,
        snapshotState: roadClosureSnapshots.snapshotState,
        closureName: roadClosureSnapshots.name,
        closureDescription: roadClosureSnapshots.description,
        shape: roadClosureSnapshots.shape,

        points: sql<PointObject[]>`(
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ${roadClosurePoints.id},
              'sequence', ${roadClosurePoints.sequenceNumber},
              'point', json_build_array(
                ST_Y(${roadClosurePoints.point}),
                ST_X(${roadClosurePoints.point})
              )
            ) ORDER BY ${roadClosurePoints.sequenceNumber} ASC
          ), '[]'::json
        )
        FROM ${roadClosurePoints}
        WHERE ${roadClosurePoints.roadClosureSnapshotId} = "road_closure_snapshot"."id")`,
      })
      .from(roadClosures)
      .leftJoin(roadClosureSnapshots, eq(roadClosures.activeSnapshotId, roadClosureSnapshots.id))
      .groupBy(roadClosures.id, roadClosureSnapshots.id);

    return new Success(result as ClosureObject[]);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch road closures.", {}, e);
  }
}

export async function getClosureById(closureId: string, snapshotId?: string): Promise<Result<ClosureObject>> {
  try {
    const [closure] = await db
      .select({
        id: roadClosures.id,
        activeSnapshotId: roadClosureSnapshots.id,
        versionName: roadClosureSnapshots.versionName,
        snapshotState: roadClosureSnapshots.snapshotState,
        closureName: roadClosureSnapshots.name,
        closureDescription: roadClosureSnapshots.description,
        shape: roadClosureSnapshots.shape,

        points: sql<PointObject[]>`(
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ${roadClosurePoints.id},
              'sequence', ${roadClosurePoints.sequenceNumber},
              'point', json_build_array(
                ST_Y(${roadClosurePoints.point}),
                ST_X(${roadClosurePoints.point})
              )
            ) ORDER BY ${roadClosurePoints.sequenceNumber} ASC
          ), '[]'::json
        )
        FROM ${roadClosurePoints}
        WHERE ${roadClosurePoints.roadClosureSnapshotId} = "road_closure_snapshot"."id")`,
      })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .leftJoin(roadClosureSnapshots, eq(roadClosureSnapshots.id, snapshotId ? snapshotId : roadClosures.activeSnapshotId))
      .groupBy(roadClosures.id, roadClosureSnapshots.id)
      .limit(1);

    if (!closure) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId });
    }

    return new Success(closure as ClosureObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch road closures.", {}, e);
  }
}

export async function createSnapshot(closureId: string, params: ClosureAddParameters): Promise<Result<ClosureObject>> {
  try {
    const [closureTarget] = await db
      .select({ id: roadClosures.id })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .limit(1);
    if (!closureTarget) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId });
    }

    const transaction = await db.transaction(async tx => {
      // Create a snapshot
      const [snapshot] = await tx
        .insert(roadClosureSnapshots)
        .values({
          versionName: params.versionName,
          name: params.closureName,
          description: params.closureDescription,
          shape: params.shape,
          roadClosureId: closureTarget.id,
        })
        .returning();
      if (!snapshot) return tx.rollback();

      // Generate sequences
      const sequences = await tx
        .insert(roadClosurePoints)
        .values(
          params.points.map(point => ({
            roadClosureSnapshotId: snapshot.id,
            sequenceNumber: point.sequence,
            point: [point.point[1], point.point[0]] as [number, number],
          })),
        )
        .returning();
      if (sequences.length !== params.points.length) return tx.rollback();

      return {
        id: snapshot.id,
        activeSnapshotId: snapshot.id,
        versionName: snapshot.versionName,
        snapshotState: snapshot.snapshotState,
        closureName: snapshot.name,
        closureDescription: snapshot.description,
        shape: snapshot.shape,
        points: sequences.map(x => ({
          id: x.id,
          sequence: x.sequenceNumber,
          point: [x.point[1], x.point[0]],
        })),
      } satisfies ClosureObject;
    });

    return new Success(transaction);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create a road closure snapshot.", { closureId, params }, e);
  }
}

export async function copySnapshot(closureId: string, snapshotId: string): Promise<Result<SnapshotItem>> {
  try {
    const [snapshot] = await db
      .select()
      .from(roadClosureSnapshots)
      .where(
        and(
          eq(roadClosureSnapshots.id, snapshotId),
          eq(roadClosureSnapshots.roadClosureId, closureId),
        ),
      )
      .limit(1);
    if (!snapshot) {
      return new Failure(ErrorCodes.ResourceNotFound, "Snapshot not found.", { closureId, snapshotId });
    }

    // Copy the snapshot points
    const points = await db
      .select()
      .from(roadClosurePoints)
      .where(eq(roadClosurePoints.roadClosureSnapshotId, snapshot.id));

    // Create a new snapshot
    const result = await db.transaction(async tx => {
      const [newSnapshot] = await tx
        .insert(roadClosureSnapshots)
        .values({
          snapshotState: "wip",
          roadClosureId: snapshot.roadClosureId,
          versionName: snapshot.versionName + " (Copy)",
          name: snapshot.name + " (Copy)",
          shape: snapshot.shape,
          description: snapshot.description,
        })
        .returning();
      if (!newSnapshot) return tx.rollback();

      if (points.length >= 0) {
        await tx
          .insert(roadClosurePoints)
          .values(points.map(p => ({
            sequenceNumber: p.sequenceNumber,
            point: p.point,
            roadClosureSnapshotId: newSnapshot.id,
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
    return new Failure(ErrorCodes.Fatal, "Unable to copy the snapshot", { closureId, snapshotId }, e);
  }
}

export async function switchSnapshot(closureId: string, snapshotId: string) {
  try {
    const [roadClosureToEdit] = await db
      .select({ id: roadClosures.id })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .limit(1);
    if (!roadClosureToEdit) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId });
    }

    const [snapshotToUse] = await db
      .select({
        id: roadClosureSnapshots.id,
        state: roadClosureSnapshots.snapshotState,
      })
      .from(roadClosureSnapshots)
      .where(
        and(
          eq(roadClosureSnapshots.id, snapshotId),
          eq(roadClosureSnapshots.roadClosureId, closureId),
        ),
      )
      .limit(1);
    if (!snapshotToUse) {
      return new Failure(ErrorCodes.ResourceNotFound, "Snapshot not found.", { closureId, snapshotId });
    }

    // Check if the state is ready
    if (snapshotToUse.state !== "ready") {
      return new Failure(ErrorCodes.ResourceNotFound, "Snapshot is not ready.", { closureId, snapshotId });
    }

    await db
      .update(roadClosures)
      .set({ activeSnapshotId: snapshotToUse.id })
      .where(eq(roadClosures.id, roadClosureToEdit.id));

    const result = await unwrap(getClosureById(closureId, snapshotToUse.id));
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to switch snapshot due to an error", { closureId, snapshotId }, e);
  }
}

export async function getAllSnapshots(closureId: string): Promise<Result<SnapshotItem[]>> {
  try {
    const [closure] = await db
      .select({ id: roadClosures.id })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .limit(1);
    if (!closure) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId });
    }

    const snapshots = await db
      .select({
        id: roadClosureSnapshots.id,
        name: roadClosureSnapshots.versionName,
        state: roadClosureSnapshots.snapshotState,
        createdOn: roadClosureSnapshots.createdAt,
        updatedAt: roadClosureSnapshots.updatedAt,
      })
      .from(roadClosureSnapshots)
      .where(eq(roadClosureSnapshots.roadClosureId, closure.id));

    return new Success(snapshots);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch road closure snapshots.", { closureId }, e);
  }
}

export async function createClosure(payload: ClosureAddParameters): Promise<Result<ClosureObject>> {
  try {
    const [newClosure] = await db
      .insert(roadClosures)
      .values({
        activeSnapshotId: "unset",
      })
      .returning();
    if (!newClosure) {
      return new Failure(ErrorCodes.Fatal, "Failed to create a road closure.", { payload });
    }

    // Create the snapshot
    const snapshot = await unwrap(createSnapshot(newClosure.id, payload));

    // Update the active snapshot
    await db
      .update(roadClosures)
      .set({ activeSnapshotId: snapshot.id })
      .where(eq(roadClosures.id, newClosure.id));

    return new Success({
      ...snapshot,
      id: newClosure.id,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create a road closure.", { payload }, e);
  }
}

export async function removeClosure(closureId: string): Promise<Result<null>> {
  try {
    const [selectedClosure] = await db
      .select({ id: roadClosures.id })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .limit(1);
    if (!selectedClosure) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId });
    }

    await db.delete(roadClosures).where(eq(roadClosures.id, selectedClosure.id));
    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete a road closure due to an exception.", { closureId }, e);
  }
}

export async function updateClosure(
  closureId: string,
  closureSnapshotId: string,
  params: ClosureUpdateParameters,
) {
  try {
    // Check for the snapshot
    const [snapshotToEdit] = await db
      .select({ id: roadClosureSnapshots.id, state: roadClosureSnapshots.snapshotState })
      .from(roadClosureSnapshots)
      .where(
        and(
          eq(roadClosureSnapshots.id, closureSnapshotId),
          eq(roadClosureSnapshots.roadClosureId, closureId),
        ),
      );
    if (!snapshotToEdit) {
      return new Failure(ErrorCodes.ResourceNotFound, "No such snapshot found.", { closureId, closureSnapshotId });
    }

    // Avoid editing a live version
    if (snapshotToEdit.state === "ready") {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        "Snapshot is read-only. Copy the snapshot and edit from there.",
        { closureId, closureSnapshotId, snapshotToEdit },
      );
    }

    // Update
    await db.transaction(async tx => {
      // Patch to apply
      const closurePatch = {
        ...(params.versionName !== undefined && { versionName: params.versionName }),
        ...(params.closureName !== undefined && { name: params.closureName }),
        ...(params.closureDescription !== undefined && { description: params.closureDescription }),
        ...(params.shape !== undefined && { shape: params.shape }),
      };

      if (Object.keys(closurePatch).length > 0) {
        const [updatedClosure] = await tx
          .update(roadClosureSnapshots)
          .set(closurePatch)
          .where(eq(roadClosureSnapshots.id, closureSnapshotId))
          .returning({ id: roadClosures.id });

        if (!updatedClosure) tx.rollback();
      } else {
        // If no parent fields are updated, just check if it exists
        const [existingClosure] = await tx
          .select({ id: roadClosureSnapshots.id })
          .from(roadClosureSnapshots)
          .where(eq(roadClosureSnapshots.id, closureSnapshotId))
          .limit(1);

        if (!existingClosure) tx.rollback();
      }

      if (params.points !== undefined) {
        await tx.delete(roadClosurePoints).where(eq(roadClosurePoints.roadClosureSnapshotId, snapshotToEdit.id));

        if (params.points.length > 0) {
          await tx.insert(roadClosurePoints).values(
            params.points.map((point) => ({
              roadClosureSnapshotId: snapshotToEdit.id,
              sequenceNumber: point.sequence,
              point: [point.point[1], point.point[0]] as [number, number],
            })),
          );
        }
      }
    });

    // Refetch
    const rendered = await unwrap(getClosureById(closureId, snapshotToEdit.id));
    return new Success(rendered);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update road closure.", { closureId, params }, e);
  }
}

export interface PointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface ClosureObject {
  id: string;
  activeSnapshotId: string;
  versionName: string;
  snapshotState: string;
  closureName: string;
  closureDescription: string;
  shape: string;
  points: Array<PointObject>;
}

export interface ClosureAddParameters {
  versionName: string;
  closureName: string;
  closureDescription: string;
  shape: string;
  points: Array<Omit<PointObject, "id">>;
}

export interface ClosureUpdateParameters {
  versionName?: string;
  closureName?: string;
  closureDescription?: string;
  shape?: string;
  points?: Array<Omit<PointObject, "id">>;
}

export interface SnapshotItem {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  updatedAt: Date;
}
