import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { routes, routeSequences } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

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
        routeNumber: routes.routeNumber,
        routeName: routes.routeName,
        routeColor: routes.routeColor,
        routeDetails: routes.routeDetails,

        // language=text
        points: sql<RoutePoint>`
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

    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch routes", {}, e);
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
    const result = await db.transaction(async tx => {
      // Create the route first
      const [route] = await tx
        .insert(routes)
        .values({
          routeName: params.routeName,
          routeNumber: params.routeNumber,
          routeColor: params.routeColor,
          routeDetails: params.routeDetails ?? "",
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
        routeDetails: route.routeDetails,
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

    return new Success(result);
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
 * Updates an existing route and optionally replaces its route points.
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
 * @param params - The route fields and/or point collections to modify.
 * @returns A `Result<RouteObject>` containing the updated route, or a failure if the update fails.
 */
export async function updateRoute(
  routeId: string,
  params: UpdateRouteParameters,
): Promise<Result<RouteObject>> {
  try {
    const finalResult = await db.transaction(async (tx) => {
      // Handle Route Parent Data
      let routeData;
      const routePatch = {
        ...(params.routeNumber !== undefined && { routeNumber: params.routeNumber }),
        ...(params.routeName !== undefined && { routeName: params.routeName }),
        ...(params.routeColor !== undefined && { routeColor: params.routeColor }),
        ...(params.routeDetails !== undefined && { routeDetails: params.routeDetails }),
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
        routeDetails: routeData.routeDetails,
        points: {
          polylineGoingTo: routeData.polylineGoingTo,
          goingTo,
          polylineGoingBack: routeData.polylineGoingBack,
          goingBack,
        },
      } as RouteObject;

    });

    return new Success(finalResult);
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

export interface RoutePoint {
  polylineGoingTo: string;
  goingTo: Array<PointObject>;
  polylineGoingBack: string;
  goingBack: Array<PointObject>;
}
