import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { roadClosureRegions, roadClosures } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

export async function getAllClosures(): Promise<Result<ClosureObject[]>> {
  try {
    const result = await db
      .select({
        id: roadClosures.id,
        closureName: roadClosures.name,
        closureDescription: roadClosures.description,

        points: sql<PointObject[]>`(
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ${roadClosureRegions.id},
              'sequence', ${roadClosureRegions.sequenceNumber},
              'point', json_build_array(
                ST_Y(${roadClosureRegions.point}),
                ST_X(${roadClosureRegions.point})
              )
            ) ORDER BY ${roadClosureRegions.sequenceNumber} ASC
          ), '[]'::json
        )
        FROM ${roadClosureRegions}
        WHERE ${roadClosureRegions.roadClosureId} = "road_closure"."id")`,
      })
      .from(roadClosures);

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch road closures.", {}, e);
  }
}

export async function createClosure(payload: ClosureAddParameters): Promise<Result<ClosureObject>> {
  try {
    const result = await db.transaction(async tx => {
      const [newClosure] = await tx
        .insert(roadClosures)
        .values({
          name: payload.closureName,
          description: payload.closureDescription,
        })
        .returning();
      if (!newClosure) return tx.rollback();

      // Generate sequences
      const sequences = await tx
        .insert(roadClosureRegions)
        .values(
          payload.points.map(point => ({
            roadClosureId: newClosure.id,
            sequenceNumber: point.sequence,
            point: [point.point[1], point.point[0]] as [number, number],
          })),
        )
        .returning();
      if (sequences.length !== payload.points.length) return tx.rollback();

      return {
        id: newClosure.id,
        closureName: newClosure.name,
        closureDescription: newClosure.description,
        points: sequences.map(x => ({
          id: x.id,
          sequence: x.sequenceNumber,
          point: [x.point[1], x.point[0]],
        })),
      } satisfies ClosureObject;
    });

    return new Success(result);
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
  params: ClosureUpdateParameters,
) {
  try {
    const updated = await db.transaction(async tx => {
      // Patch to apply
      const closurePatch = {
        ...(params.closureName !== undefined && { name: params.closureName }),
        ...(params.closureDescription !== undefined && { description: params.closureDescription }),
      };

      if (Object.keys(closurePatch).length > 0) {
        const [updatedClosure] = await tx
          .update(roadClosures)
          .set(closurePatch)
          .where(eq(roadClosures.id, closureId))
          .returning({ id: roadClosures.id });

        if (!updatedClosure) tx.rollback();
      } else {
        // If no parent fields are updated, just check if it exists
        const [existingClosure] = await tx
          .select({ id: roadClosures.id })
          .from(roadClosures)
          .where(eq(roadClosures.id, closureId))
          .limit(1);

        if (!existingClosure) tx.rollback();
      }

      if (params.points !== undefined) {
        await tx.delete(roadClosureRegions).where(eq(roadClosureRegions.roadClosureId, closureId));

        if (params.points.length > 0) {
          await tx.insert(roadClosureRegions).values(
            params.points.map((point) => ({
              roadClosureId: closureId,
              sequenceNumber: point.sequence,
              point: [point.point[1], point.point[0]] as [number, number],
            })),
          );
        }
      }

      // Return the updated result
      const [finalResult] = await db
        .select({
          id: roadClosures.id,
          closureName: roadClosures.name,
          closureDescription: roadClosures.description,

          points: sql<PointObject[]>`(
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', ${roadClosureRegions.id},
                'sequence', ${roadClosureRegions.sequenceNumber},
                'point', json_build_array(
                  ST_Y(${roadClosureRegions.point}),
                  ST_X(${roadClosureRegions.point})
                )
              ) ORDER BY ${roadClosureRegions.sequenceNumber} ASC
            ), '[]'::json
          )
          FROM ${roadClosureRegions}
          WHERE ${roadClosureRegions.roadClosureId} = "road_closure"."id")`,
        })
        .from(roadClosures)
        .where(eq(roadClosures.id, closureId));

      return finalResult;
    });

    return new Success(updated);
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
  closureName: string;
  closureDescription: string;
  points: Array<PointObject>;
}

export interface ClosureAddParameters {
  closureName: string;
  closureDescription: string;
  points: Array<Omit<PointObject, "id">>;
}

export interface ClosureUpdateParameters {
  closureName?: string;
  closureDescription?: string;
  points?: Array<Omit<PointObject, "id">>;
}
