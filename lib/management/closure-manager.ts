import {and, eq, gt, or, sql} from "drizzle-orm";

import {db} from "@/lib/db";
import type * as GeoJSON from "@/lib/db/postgis-extension/geojsonTypes";
import {roadClosures} from "@/lib/db/schema";
import {ErrorCodes, Failure, Result, Success} from "@/lib/one-of/types";

export function polygonToPointObjects(polygon: GeoJSON.Polygon | null, closureId: string): PointObject[] {
  if (!polygon?.coordinates?.[0]) return [];
  const ring = polygon.coordinates[0];
  const coords = ring.length > 1 ? ring.slice(0, -1) : ring;
  return coords.map((pos, i) => ({
    id: `${closureId}-${i + 1}`,
    sequence: i + 1,
    point: [pos[1], pos[0]] as [number, number],
  }));
}

export function pointsToPolygon(points: Array<Omit<PointObject, "id">>): GeoJSON.Polygon {
  const sorted = [...points].sort((a, b) => a.sequence - b.sequence);
  const coords = sorted.map(p => [p.point[1], p.point[0]]);
  if (coords.length > 0) coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

/**
 * Fetches all road closures.
 *
 * @param forPublic {boolean} When true, returns only published closures.
 */
export async function getAllClosures(forPublic: boolean = true): Promise<Result<ClosureBaseObject[] | ClosureObject[]>> {
  try {
    if (forPublic) {
      const rows = await db
        .select({
          id: roadClosures.id,
          closureName: roadClosures.name,
          closureDescription: roadClosures.description,
          shape: roadClosures.shape,
          closureType: roadClosures.closureType,
          endDate: roadClosures.endDate,
          polygon: roadClosures.polygon,
        })
        .from(roadClosures)
        .where(and(
          eq(roadClosures.isPublic, true),
          or(
            eq(roadClosures.closureType, "indefinite"),
            and(
              eq(roadClosures.closureType, "scheduled"),
              gt(roadClosures.endDate, sql`NOW()`),
            ),
          ),
        ));

      const result = rows.map(row => ({
        id: row.id,
        closureName: row.closureName,
        closureDescription: row.closureDescription,
        shape: row.shape,
        closureType: row.closureType,
        endDate: row.endDate,
        points: polygonToPointObjects(row.polygon, row.id),
      }));

      return new Success(result satisfies ClosureBaseObject[]);
    }

    const rows = await db
      .select({
        id: roadClosures.id,
        closureName: roadClosures.name,
        closureDescription: roadClosures.description,
        shape: roadClosures.shape,
        closureType: roadClosures.closureType,
        endDate: roadClosures.endDate,
        isPublic: roadClosures.isPublic,
        polygon: roadClosures.polygon,
      })
      .from(roadClosures);

    const result = rows.map(row => ({
      id: row.id,
      closureName: row.closureName,
      closureDescription: row.closureDescription,
      shape: row.shape,
      closureType: row.closureType,
      endDate: row.endDate,
      isPublic: row.isPublic,
      points: polygonToPointObjects(row.polygon, row.id),
    }));

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
          closureType: payload.closureType,
          endDate: payload.endDate,
          polygon: pointsToPolygon(payload.points),
          isPublic: false,
          ownerId,
        })
        .returning({
          id: roadClosures.id,
          name: roadClosures.name,
          description: roadClosures.description,
          shape: roadClosures.shape,
          closureType: roadClosures.closureType,
          endDate: roadClosures.endDate,
          isPublic: roadClosures.isPublic,
        });

      if (!newClosure) {
        return tx.rollback();
      }

      return {
        id: newClosure.id,
        closureName: newClosure.name,
        closureDescription: newClosure.description,
        shape: newClosure.shape,
        closureType: newClosure.closureType,
        endDate: newClosure.endDate,
        isPublic: newClosure.isPublic,
        points: polygonToPointObjects(pointsToPolygon(payload.points), newClosure.id),
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
        ...(params.closureType !== undefined && { closureType: params.closureType }),
        ...(params.endDate !== undefined && { endDate: params.endDate }),
        ...(Array.isArray(params.points) && {
          polygon: params.points.length === 0 ? null : pointsToPolygon(params.points),
        }),
      };

      let updatedRoadClosure: {
        id: string;
        name: string;
        description: string;
        shape: string;
        closureType: "indefinite" | "scheduled";
        endDate: Date | null;
        isPublic: boolean;
        polygon: GeoJSON.Polygon | null;
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
            closureType: roadClosures.closureType,
            endDate: roadClosures.endDate,
            isPublic: roadClosures.isPublic,
            polygon: roadClosures.polygon,
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
            closureType: roadClosures.closureType,
            endDate: roadClosures.endDate,
            isPublic: roadClosures.isPublic,
            polygon: roadClosures.polygon,
          })
          .from(roadClosures)
          .where(eq(roadClosures.id, closure.id))
          .limit(1);

        if (!existingClosure) {
          return tx.rollback();
        }

        updatedRoadClosure = existingClosure;
      }

      const points = polygonToPointObjects(updatedRoadClosure.polygon, updatedRoadClosure.id);

      return {
        id: updatedRoadClosure.id,
        closureName: updatedRoadClosure.name,
        closureDescription: updatedRoadClosure.description,
        shape: updatedRoadClosure.shape,
        closureType: updatedRoadClosure.closureType,
        endDate: updatedRoadClosure.endDate,
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

export async function isClosurePublished(closureId: string): Promise<Result<boolean>> {
  try {
    const [selectedClosure] = await db
      .select({ isPublic: roadClosures.isPublic })
      .from(roadClosures)
      .where(eq(roadClosures.id, closureId))
      .limit(1);

    if (!selectedClosure) {
      return new Failure(ErrorCodes.ResourceNotFound, "Road closure not found.", { closureId });
    }

    return new Success(selectedClosure.isPublic);
  } catch (error) {
    return new Failure(ErrorCodes.Fatal, "Unable to determine closure publishing status.", { closureId }, error);
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
  closureType: "indefinite" | "scheduled";
  endDate: Date | null;
  points: Array<PointObject>;
}

export type ClosureObject = ClosureBaseObject & {
  isPublic: boolean;
}

export interface ClosureAddParameters {
  closureName: string;
  closureDescription: string;
  shape: string;
  closureType: "indefinite" | "scheduled";
  endDate: Date | null;
  points: Array<Omit<PointObject, "id">>;
}

export interface ClosureUpdateParameters {
  closureName?: string;
  closureDescription?: string;
  shape?: string;
  closureType?: "indefinite" | "scheduled";
  endDate?: Date | null;
  points?: Array<Omit<PointObject, "id">>;
}

export interface PublicToggleResult {
  id: string;
  isPublic: boolean;
}
