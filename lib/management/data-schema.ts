import { z } from "zod";

const LatLngTuple = z.tuple([z.number(), z.number()]);

const SnapshotStateEnum = z.enum(["ready", "wip", "for_approval"]);
const SequenceTypeEnum = z.enum(["going_to", "going_back"]);
const RestrictionTypeEnum = z.enum(["universal", "specific"]);
const DisallowedDirectionEnum = z.enum(["direction_to", "direction_back", "both"]);
const ClosureTypeEnum = z.enum(["indefinite", "scheduled"]);

const RouteSequencePointSchema = z.object({
  sequence: z.number().int().nonnegative(),
  address: z.string(),
  point: LatLngTuple,
});

const RouteSnapshotPointsSchema = z.object({
  goingTo: z.array(RouteSequencePointSchema),
  goingBack: z.array(RouteSequencePointSchema),
});

export const RouteSnapshotExportSchema = z.object({
  id: z.uuid(),
  routeId: z.string(),
  versionName: z.string(),
  snapshotState: SnapshotStateEnum,
  vehicleTypeId: z.uuid(),
  routeNumber: z.string(),
  routeName: z.string(),
  routeColor: z.string(),
  routeDetails: z.string(),
  availableFrom: z.string(),
  availableTo: z.string(),
  fleetCount: z.number().int(),
  polylineGoingTo: z.string(),
  polylineGoingBack: z.string(),
  points: RouteSnapshotPointsSchema,
});

export const RouteExportSchema = z.object({
  id: z.uuid(),
  routeNumber: z.string(),
  routeName: z.string(),
  routeColor: z.string(),
  routeDetails: z.string(),
  availableFrom: z.string(),
  availableTo: z.string(),
  fleetCount: z.number().int(),
  isPublic: z.boolean(),
  vehicleTypeId: z.uuid(),
  activeSnapshotId: z.uuid(),
  polylineGoingTo: z.string(),
  polylineGoingBack: z.string(),
  snapshots: z.array(RouteSnapshotExportSchema),
});

const RegionPointSchema = z.object({
  sequence: z.number().int().nonnegative(),
  point: LatLngTuple,
});

const RegionStationSchema = z.object({
  id: z.uuid(),
  address: z.string(),
  availableFrom: z.string(),
  availableTo: z.string(),
  point: LatLngTuple,
});

export const RegionSnapshotExportSchema = z.object({
  id: z.uuid(),
  regionId: z.uuid(),
  versionName: z.string(),
  snapshotState: SnapshotStateEnum,
  regionName: z.string(),
  color: z.string(),
  shapeType: z.string(),
  points: z.array(RegionPointSchema),
  stations: z.array(RegionStationSchema),
});

export const RegionExportSchema = z.object({
  id: z.uuid(),
  regionName: z.string(),
  color: z.string(),
  shapeType: z.string(),
  isPublic: z.boolean(),
  activeSnapshotId: z.uuid(),
  snapshots: z.array(RegionSnapshotExportSchema),
});

const ClosurePointSchema = z.object({
  sequence: z.number().int().nonnegative(),
  point: LatLngTuple,
});

export const ClosureExportSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  shape: z.string(),
  closureType: ClosureTypeEnum,
  endDate: z.string().nullable(),
  isPublic: z.boolean(),
  points: z.array(ClosurePointSchema),
});

export const StopExportSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  restrictionType: RestrictionTypeEnum,
  disallowedDirection: DisallowedDirectionEnum,
  polyline: z.string(),
  isPublic: z.boolean(),
  routeIds: z.array(z.uuid()),
  points: z.array(ClosurePointSchema),
});

export const VehicleTypeExportSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  requiresRoute: z.boolean(),
});

export const OrphanedSnapshotsSchema = z.object({
  routes: z.array(RouteSnapshotExportSchema),
  regions: z.array(RegionSnapshotExportSchema),
});

export const ImportPayloadSchema = z.object({
  version: z.literal("1.0"),
  exportedAt: z.string().optional(),
  vehicleTypes: z.array(VehicleTypeExportSchema),
  routes: z.array(RouteExportSchema),
  regions: z.array(RegionExportSchema),
  closures: z.array(ClosureExportSchema),
  stops: z.array(StopExportSchema),
  orphanedSnapshots: OrphanedSnapshotsSchema.optional(),
});

export type ImportPayload = z.infer<typeof ImportPayloadSchema>;
export type ExportPayload = ImportPayload & { exportedAt: string; orphanedSnapshots: z.infer<typeof OrphanedSnapshotsSchema> };

export {
  SnapshotStateEnum,
  SequenceTypeEnum,
  RestrictionTypeEnum,
  DisallowedDirectionEnum,
  ClosureTypeEnum,
};
