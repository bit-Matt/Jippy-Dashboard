import { and, eq, ilike, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { routeSnapshots, vehicleTypes } from "@/lib/db/schema";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

export interface VehicleTypeObject {
  id: string;
  name: string;
  requiresRoute: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVehicleTypeParams {
  name: string;
  requiresRoute: boolean;
}

export interface UpdateVehicleTypeParams {
  name?: string;
  requiresRoute?: boolean;
}

export async function getAllVehicleTypes(): Promise<Result<VehicleTypeObject[]>> {
  try {
    const result = await db
      .select({
        id: vehicleTypes.id,
        name: vehicleTypes.name,
        requiresRoute: vehicleTypes.requiresRoute,
        createdAt: vehicleTypes.createdAt,
        updatedAt: vehicleTypes.updatedAt,
      })
      .from(vehicleTypes)
      .orderBy(vehicleTypes.name);

    return new Success(result as VehicleTypeObject[]);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch vehicle types", {}, e);
  }
}

export async function createVehicleType(
  params: CreateVehicleTypeParams,
  ownerId: string,
): Promise<Result<VehicleTypeObject>> {
  try {
    const [existing] = await db
      .select({ id: vehicleTypes.id })
      .from(vehicleTypes)
      .where(ilike(vehicleTypes.name, params.name.trim()))
      .limit(1);
    if (existing) {
      return new Failure(ErrorCodes.ValidationFailure, "Vehicle type already exists.", { name: params.name });
    }

    const [result] = await db
      .insert(vehicleTypes)
      .values({
        ownerId,
        name: params.name.trim(),
        requiresRoute: params.requiresRoute,
      })
      .returning();

    if (!result) {
      return new Failure(ErrorCodes.Fatal, "Failed to create vehicle type", { params });
    }

    return new Success(result as VehicleTypeObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create vehicle type", { params }, e);
  }
}

export async function updateVehicleType(
  vehicleTypeId: string,
  params: UpdateVehicleTypeParams,
): Promise<Result<VehicleTypeObject>> {
  try {
    const [existing] = await db
      .select({ id: vehicleTypes.id })
      .from(vehicleTypes)
      .where(eq(vehicleTypes.id, vehicleTypeId))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Vehicle type not found.", { vehicleTypeId });
    }

    if (params.name !== undefined) {
      const [nameConflict] = await db
        .select({ id: vehicleTypes.id })
        .from(vehicleTypes)
        .where(
          and(
            ilike(vehicleTypes.name, params.name.trim()),
            ne(vehicleTypes.id, vehicleTypeId),
          ),
        )
        .limit(1);

      if (nameConflict) {
        return new Failure(ErrorCodes.ValidationFailure, "Vehicle type already exists.", { name: params.name });
      }
    }

    const [updated] = await db
      .update(vehicleTypes)
      .set({
        ...(params.name !== undefined && { name: params.name.trim() }),
        ...(params.requiresRoute !== undefined && { requiresRoute: params.requiresRoute }),
      })
      .where(eq(vehicleTypes.id, vehicleTypeId))
      .returning();

    if (!updated) {
      return new Failure(ErrorCodes.Fatal, "Failed to update vehicle type", { vehicleTypeId, params });
    }

    return new Success(updated as VehicleTypeObject);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update vehicle type", { vehicleTypeId, params }, e);
  }
}

export async function deleteVehicleType(vehicleTypeId: string): Promise<Result<undefined>> {
  try {
    const [existing] = await db
      .select({ id: vehicleTypes.id })
      .from(vehicleTypes)
      .where(eq(vehicleTypes.id, vehicleTypeId))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Vehicle type not found.", { vehicleTypeId });
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(routeSnapshots)
      .where(eq(routeSnapshots.vehicleTypeId, vehicleTypeId));

    if ((count ?? 0) > 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Vehicle type is in use by existing route snapshots and cannot be removed.",
        { vehicleTypeId, usageCount: count },
      );
    }

    await db
      .delete(vehicleTypes)
      .where(eq(vehicleTypes.id, vehicleTypeId));

    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete vehicle type", { vehicleTypeId }, e);
  }
}
