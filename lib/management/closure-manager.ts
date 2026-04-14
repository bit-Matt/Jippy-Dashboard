import {eq, sql} from "drizzle-orm";

import {db} from "@/lib/db";
import {roadClosurePoints, roadClosures} from "@/lib/db/schema";
import {ErrorCodes, Failure, Result, Success} from "@/lib/one-of/types";

/**
 * Fetches all road closures.
 *
 * @param forPublic {boolean} When true, returns only published closures.
 */
export async function getAllClosures(forPublic: boolean = true): Promise<Result<ClosureBaseObject[] | ClosureObject[]>> {
  try {
    const pointsAggregation = sql<PointObject[]>`
      COALESCE(
        json_agg(
          json_build_object(
            'id', ${roadClosurePoints.id},
            'sequence', ${roadClosurePoints.sequenceNumber},
            'point', json_build_array(
              ST_Y(${roadClosurePoints.point}),
              ST_X(${roadClosurePoints.point})
            )
          )
          ORDER BY ${roadClosurePoints.sequenceNumber} ASC
        ) FILTER (WHERE ${roadClosurePoints.id} IS NOT NULL),
        '[]'::json
      )
    `;

    if (forPublic) {
      const result = await db
        .select({
          id: roadClosures.id,
          closureName: roadClosures.name,
          closureDescription: roadClosures.description,
          shape: roadClosures.shape,
          points: pointsAggregation,
        })
        .from(roadClosures)
        .leftJoin(roadClosurePoints, eq(roadClosurePoints.roadClosureId, roadClosures.id))
        .where(eq(roadClosures.isPublic, true))
        .groupBy(
          roadClosures.id,
          roadClosures.name,
          roadClosures.description,
          roadClosures.shape,
        );

      return new Success(result satisfies ClosureBaseObject[]);
    }

    const result = await db
      .select({
        id: roadClosures.id,
        closureName: roadClosures.name,
        closureDescription: roadClosures.description,
        shape: roadClosures.shape,
        points: pointsAggregation,
        isPublic: roadClosures.isPublic,
      })
      .from(roadClosures)
      .leftJoin(roadClosurePoints, eq(roadClosurePoints.roadClosureId, roadClosures.id))
      .groupBy(
        roadClosures.id,
        roadClosures.name,
        roadClosures.description,
        roadClosures.shape,
        roadClosures.isPublic,
      );

    return new Success(result satisfies ClosureObject[]);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch road closures.", {}, error);
  }
}

/**
 * Creates a road closure and its polygon points.
 *
 * @param payload Closure data and polygon points.
 * @param ownerId User identifier of the creator.
 */
export async function createClosure(payload: ClosureAddParameters, ownerId: string): Promise<Result<ClosureObject>> {
  try {
    const result = await db.transaction(async tx => {
      const [newClosure] = await tx
        .insert(roadClosures)
        .values({
          name: payload.closureName,
          description: payload.closureDescription,
          shape: payload.shape,
          isPublic: false,
          ownerId,
        })
        .returning({
          id: roadClosures.id,
          name: roadClosures.name,
          description: roadClosures.description,
          shape: roadClosures.shape,
          isPublic: roadClosures.isPublic,
        });

      if (!newClosure) {
        return tx.rollback();
      }

      const pointRows = await tx
        .insert(roadClosurePoints)
        .values(payload.points.map((point) => ({
          roadClosureId: newClosure.id,
          sequenceNumber: point.sequence,
          point: [point.point[1], point.point[0]] as [number, number],
        })))
        .returning({
          id: roadClosurePoints.id,
          sequence: roadClosurePoints.sequenceNumber,
          point: roadClosurePoints.point,
        });

      return {
        id: newClosure.id,
        closureName: newClosure.name,
        closureDescription: newClosure.description,
        shape: newClosure.shape,
        isPublic: newClosure.isPublic,
        points: pointRows.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          point: [row.point[1], row.point[0]] as [number, number],
        })),
      } satisfies ClosureObject;
    });

    return new Success(result);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to create a road closure.", { payload }, error);
  }
}

/**
 * Deletes a road closure and all of its points.
 *
 * @param closureId Closure identifier.
 */
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
  } catch (error) {
    return new Failure(
      ErrorCodes.Fatal,
      "Unable to delete road closure due to an exception.",
      { closureId },
      error,
    );
  }
}

/**
 * Updates closure fields and optionally replaces polygon points.
 *
 * Published closures are read-only and must be unpublished before editing.
 *
 * @param closureId Closure identifier.
 * @param params Partial closure patch.
 */
export async function updateClosure(closureId: string, params: ClosureUpdateParameters): Promise<Result<ClosureObject>> {
  try {
    const [closure] = await db
      .select({ id: roadClosures.id, isPublic: roadClosures.isPublic })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .limit(1);

    if (!closure) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId });
    }

    if (closure.isPublic) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Published closures cannot be modified. Unpublish the closure first.",
        { closureId },
      );
    }

    const updated = await db.transaction(async tx => {
      const closurePatch = {
        ...(params.closureName !== undefined && { name: params.closureName }),
        ...(params.closureDescription !== undefined && { description: params.closureDescription }),
        ...(params.shape !== undefined && { shape: params.shape }),
      };

      let updatedRoadClosure: {
        id: string;
        name: string;
        description: string;
        shape: string;
        isPublic: boolean;
      };

      if (Object.keys(closurePatch).length > 0) {
        const [updatedClosure] = await tx
          .update(roadClosures)
          .set(closurePatch)
          .where(eq(roadClosures.id, closure.id))
          .returning({
            id: roadClosures.id,
            name: roadClosures.name,
            description: roadClosures.description,
            shape: roadClosures.shape,
            isPublic: roadClosures.isPublic,
          });

        if (!updatedClosure) {
          return tx.rollback();
        }

        updatedRoadClosure = updatedClosure;
      } else {
        const [existingClosure] = await tx
          .select({
            id: roadClosures.id,
            name: roadClosures.name,
            description: roadClosures.description,
            shape: roadClosures.shape,
            isPublic: roadClosures.isPublic,
          })
          .from(roadClosures)
          .where(eq(roadClosures.id, closure.id))
          .limit(1);

        if (!existingClosure) {
          return tx.rollback();
        }

        updatedRoadClosure = existingClosure;
      }

      let points: PointObject[];
      if (Array.isArray(params.points)) {
        await tx.delete(roadClosurePoints).where(eq(roadClosurePoints.roadClosureId, updatedRoadClosure.id));

        if (params.points.length === 0) {
          points = [];
        } else {
          const pointRows = await tx
            .insert(roadClosurePoints)
            .values(params.points.map((point) => ({
              roadClosureId: updatedRoadClosure.id,
              sequenceNumber: point.sequence,
              point: [point.point[1], point.point[0]] as [number, number],
            })))
            .returning({
              id: roadClosurePoints.id,
              sequence: roadClosurePoints.sequenceNumber,
              point: roadClosurePoints.point,
            });

          points = pointRows.map((row) => ({
            id: row.id,
            sequence: row.sequence,
            point: [row.point[1], row.point[0]] as [number, number],
          }));
        }
      } else {
        const existingPoints = await tx
          .select({
            id: roadClosurePoints.id,
            sequence: roadClosurePoints.sequenceNumber,
            point: roadClosurePoints.point,
          })
          .from(roadClosurePoints)
          .where(eq(roadClosurePoints.roadClosureId, updatedRoadClosure.id));

        points = existingPoints.map((row) => ({
          id: row.id,
          sequence: row.sequence,
          point: [row.point[1], row.point[0]] as [number, number],
        }));
      }

      return {
        id: updatedRoadClosure.id,
        closureName: updatedRoadClosure.name,
        closureDescription: updatedRoadClosure.description,
        shape: updatedRoadClosure.shape,
        isPublic: updatedRoadClosure.isPublic,
        points,
      } satisfies ClosureObject;
    });

    return new Success(updated);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Failed to update road closure.", { closureId, params }, error);
  }
}

export async function isClosureDeletableByContributor(closureId: string): Promise<Result<boolean>> {
  try {
    const [closure] = await db
      .select({ isPublic: roadClosures.isPublic })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .limit(1);

    return new Success(!closure.isPublic);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to determine if the closure is deletable", { closureId }, e);
  }
}

/**
 * Toggles closure visibility in public endpoints.
 *
 * @param closureId Closure identifier.
 * @param state Next publish state.
 */
export async function togglePublic(closureId: string, state: boolean): Promise<Result<PublicToggleResult>> {
  try {
    const [update] = await db
      .update(roadClosures)
      .set({ isPublic: state })
      .where(eq(roadClosures.id, closureId))
      .returning({ id: roadClosures.id, isPublic: roadClosures.isPublic });

    if (!update) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId, state });
    }

    return new Success({
      id: update.id,
      isPublic: update.isPublic,
    });
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Unable to toggle public visibility.", { closureId, state }, error);
  }
}

export interface PointObject {
  id: string;
  sequence: number;
  point: [number, number];
}

export interface ClosureBaseObject {
  id: string;
  closureName: string;
  closureDescription: string;
  shape: string;
  points: Array<PointObject>;
}

export type ClosureObject = ClosureBaseObject & {
  isPublic: boolean;
}

export interface ClosureAddParameters {
  closureName: string;
  closureDescription: string;
  shape: string;
  points: Array<Omit<PointObject, "id">>;
}

export interface ClosureUpdateParameters {
  closureName?: string;
  closureDescription?: string;
  shape?: string;
  points?: Array<Omit<PointObject, "id">>;
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}
