import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import {
  region,
  regionSequences,
  regionSnapshots,
  regionStations,
  roadClosures,
  routeSequences,
  routeSnapshots,
  routes,
  restrictedBordingZone,
  routeRestrictedInBoardingZone,
  vehicleTypes,
} from "@/lib/db/schema";
import type { ExportPayload, ImportPayload } from "@/lib/management/data-schema";
import { polygonToPointObjects, pointsToPolygon } from "@/lib/management/closure-manager";
import { lineStringToStopPoints, pointsToLineString } from "@/lib/management/stop-manager";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of/types";

type LatLng = [number, number];

type RouteSnapshotPointsRow = {
  polylineGoingTo: string;
  goingTo: { sequence: number; address: string; point: LatLng }[];
  polylineGoingBack: string;
  goingBack: { sequence: number; address: string; point: LatLng }[];
};

type RegionSnapshotRow = {
  id: string;
  regionId: string;
  versionName: string;
  snapshotState: "ready" | "wip" | "for_approval";
  regionName: string;
  color: string;
  shapeType: string;
  points: { sequence: number; point: LatLng }[];
  stations: {
    id: string;
    address: string;
    availableFrom: string;
    availableTo: string;
    point: LatLng;
  }[];
};

function toDbPoint(point: LatLng): LatLng {
  return [point[1], point[0]];
}

function toUtcTime(localTime: string): string {
  const [h, m] = localTime.split(":").map(Number);
  const dt = DateTime.fromObject({ hour: h, minute: m }, { zone: "Asia/Manila" }).toUTC();
  return `${String(dt.hour).padStart(2, "0")}:${String(dt.minute).padStart(2, "0")}`;
}

function fromUtcTime(utcTime: string): string {
  const [h, m] = utcTime.split(":").map(Number);
  const dt = DateTime.fromObject({ hour: h, minute: m }, { zone: "UTC" }).setZone("Asia/Manila");
  return `${String(dt.hour).padStart(2, "0")}:${String(dt.minute).padStart(2, "0")}`;
}

class IdRemapper {
  private readonly map = new Map<string, string>();

  remap(oldId: string): string {
    const existing = this.map.get(oldId);
    if (existing) return existing;

    const newId = uuidv7();
    this.map.set(oldId, newId);
    return newId;
  }

  get(oldId: string): string | undefined {
    return this.map.get(oldId);
  }

  set(oldId: string, newId: string): void {
    this.map.set(oldId, newId);
  }
}

async function fetchRouteSnapshotsWithPoints(routeIds: string[]): Promise<Map<string, ImportPayload["routes"][number]["snapshots"]>> {
  if (routeIds.length === 0) return new Map();

  const routeIdTexts = routeIds.map(id => id);

  const rows = await db
    .select({
      id: routeSnapshots.id,
      routeId: routeSnapshots.routeId,
      versionName: routeSnapshots.versionName,
      snapshotState: routeSnapshots.snapshotState,
      vehicleTypeId: routeSnapshots.vehicleTypeId,
      routeNumber: routeSnapshots.routeNumber,
      routeName: routeSnapshots.routeName,
      routeColor: routeSnapshots.routeColor,
      routeDetails: routeSnapshots.routeDetails,
      availableFrom: routeSnapshots.availableFrom,
      availableTo: routeSnapshots.availableTo,
      fleetCount: routeSnapshots.fleetCount,
      polylineGoingTo: routeSnapshots.polylineGoingTo,
      polylineGoingBack: routeSnapshots.polylineGoingBack,
      points: sql<RouteSnapshotPointsRow>`
        json_build_object(
          'polylineGoingTo', ${routeSnapshots.polylineGoingTo},
          'goingTo', COALESCE(
            json_agg(
              json_build_object(
                'sequence', ${routeSequences.sequenceNumber},
                'address', ${routeSequences.address},
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
    .leftJoin(routeSequences, eq(routeSnapshots.id, routeSequences.routeSnapshotId))
    .where(inArray(routeSnapshots.routeId, routeIdTexts))
    .groupBy(routeSnapshots.id);

  const grouped = new Map<string, ImportPayload["routes"][number]["snapshots"]>();
  for (const row of rows) {
    const snapshots = grouped.get(row.routeId) ?? [];
    snapshots.push({
      id: row.id,
      routeId: row.routeId,
      versionName: row.versionName,
      snapshotState: row.snapshotState,
      vehicleTypeId: row.vehicleTypeId,
      routeNumber: row.routeNumber,
      routeName: row.routeName,
      routeColor: row.routeColor,
      routeDetails: row.routeDetails,
      availableFrom: row.availableFrom,
      availableTo: row.availableTo,
      fleetCount: row.fleetCount,
      polylineGoingTo: row.polylineGoingTo,
      polylineGoingBack: row.polylineGoingBack,
      points: {
        goingTo: row.points.goingTo ?? [],
        goingBack: row.points.goingBack ?? [],
      },
    });
    grouped.set(row.routeId, snapshots);
  }

  return grouped;
}

async function fetchOrphanedRouteSnapshots(): Promise<ImportPayload["routes"][number]["snapshots"]> {
  const rows = await db
    .select({ routeId: routeSnapshots.routeId })
    .from(routeSnapshots);

  const allRouteIds = new Set(
    (await db.select({ id: routes.id }).from(routes)).map(r => r.id),
  );

  const orphanedRouteIds = [...new Set(
    rows
      .map(r => r.routeId)
      .filter(routeId => !allRouteIds.has(routeId)),
  )];

  if (orphanedRouteIds.length === 0) return [];

  const grouped = await fetchRouteSnapshotsWithPoints(orphanedRouteIds);
  return orphanedRouteIds.flatMap(routeId => grouped.get(routeId) ?? []);
}

async function fetchRegionSnapshotRows(snapshotIds: string[]): Promise<RegionSnapshotRow[]> {
  if (snapshotIds.length === 0) return [];

  const rows = await db
    .select({
      id: regionSnapshots.id,
      regionId: regionSnapshots.regionId,
      versionName: regionSnapshots.versionName,
      snapshotState: regionSnapshots.snapshotState,
      regionName: regionSnapshots.name,
      color: regionSnapshots.color,
      shapeType: regionSnapshots.shapeType,
      points: sql<{ sequence: number; point: LatLng }[]>`
        COALESCE(
          json_agg(
            json_build_object(
              'sequence', ${regionSequences.sequenceNumber},
              'point', json_build_array(
                ST_Y(${regionSequences.point}),
                ST_X(${regionSequences.point})
              )
            ) ORDER BY ${regionSequences.sequenceNumber} ASC
          ) FILTER (WHERE ${regionSequences.id} IS NOT NULL),
          '[]'::json
        )
      `,
    })
    .from(regionSnapshots)
    .leftJoin(regionSequences, eq(regionSnapshots.id, regionSequences.regionSnapshotId))
    .where(inArray(regionSnapshots.id, snapshotIds))
    .groupBy(regionSnapshots.id);

  const stationRows = await db
    .select({
      regionSnapshotId: regionStations.regionSnapshotId,
      id: regionStations.id,
      address: regionStations.address,
      availableFrom: regionStations.availableFrom,
      availableTo: regionStations.availableTo,
      point: sql<LatLng>`
        json_build_array(
          ST_Y(${regionStations.point}),
          ST_X(${regionStations.point})
        )
      `,
    })
    .from(regionStations)
    .where(inArray(regionStations.regionSnapshotId, snapshotIds));

  const stationsBySnapshotId = new Map<string, RegionSnapshotRow["stations"]>();
  for (const station of stationRows) {
    const stations = stationsBySnapshotId.get(station.regionSnapshotId) ?? [];
    stations.push({
      id: station.id,
      address: station.address,
      availableFrom: fromUtcTime(station.availableFrom),
      availableTo: fromUtcTime(station.availableTo),
      point: station.point,
    });
    stationsBySnapshotId.set(station.regionSnapshotId, stations);
  }

  return rows.map(row => ({
    ...row,
    points: row.points ?? [],
    stations: stationsBySnapshotId.get(row.id) ?? [],
  }));
}

async function fetchRegionSnapshotsByRegionIds(regionIds: string[]): Promise<Map<string, ImportPayload["regions"][number]["snapshots"]>> {
  if (regionIds.length === 0) return new Map();

  const snapshotRows = await db
    .select({ id: regionSnapshots.id, regionId: regionSnapshots.regionId })
    .from(regionSnapshots)
    .where(inArray(regionSnapshots.regionId, regionIds));

  const detailed = await fetchRegionSnapshotRows(snapshotRows.map(s => s.id));
  const detailedById = new Map(detailed.map(s => [s.id, s]));

  const grouped = new Map<string, ImportPayload["regions"][number]["snapshots"]>();
  for (const { id, regionId } of snapshotRows) {
    const snapshot = detailedById.get(id);
    if (!snapshot) continue;

    const snapshots = grouped.get(regionId) ?? [];
    snapshots.push(snapshot);
    grouped.set(regionId, snapshots);
  }

  return grouped;
}

async function fetchOrphanedRegionSnapshots(): Promise<ImportPayload["regions"][number]["snapshots"]> {
  const allRegionIds = new Set(
    (await db.select({ id: region.id }).from(region)).map(r => r.id),
  );

  const snapshotRows = await db
    .select({ id: regionSnapshots.id, regionId: regionSnapshots.regionId })
    .from(regionSnapshots);

  const orphanedSnapshotIds = snapshotRows
    .filter(s => !allRegionIds.has(s.regionId))
    .map(s => s.id);

  return fetchRegionSnapshotRows(orphanedSnapshotIds);
}

export async function exportAllData(): Promise<Result<ExportPayload>> {
  try {
    const [
      vehicleTypeRows,
      routeRows,
      regionRows,
      closureRows,
      stopRows,
    ] = await Promise.all([
      db.select({
        id: vehicleTypes.id,
        name: vehicleTypes.name,
        requiresRoute: vehicleTypes.requiresRoute,
      }).from(vehicleTypes),

      db.select({
        id: routes.id,
        routeNumber: routes.routeNumber,
        routeName: routes.routeName,
        routeColor: routes.routeColor,
        routeDetails: routes.routeDetails,
        availableFrom: routes.availableFrom,
        availableTo: routes.availableTo,
        fleetCount: routes.fleetCount,
        isPublic: routes.isPublic,
        vehicleTypeId: routes.vehicleTypeId,
        activeSnapshotId: routes.activeSnapshotId,
        polylineGoingTo: routes.polylineGoingTo,
        polylineGoingBack: routes.polylineGoingBack,
      }).from(routes),

      db.select({
        id: region.id,
        regionName: region.name,
        color: region.color,
        shapeType: region.shapeType,
        isPublic: region.isPublic,
        activeSnapshotId: region.activeSnapshotId,
      }).from(region),

      db.select({
        id: roadClosures.id,
        name: roadClosures.name,
        description: roadClosures.description,
        shape: roadClosures.shape,
        closureType: roadClosures.closureType,
        endDate: roadClosures.endDate,
        isPublic: roadClosures.isPublic,
        polygon: roadClosures.polygon,
      }).from(roadClosures),

      db.select({
        id: restrictedBordingZone.id,
        name: restrictedBordingZone.name,
        restrictionType: restrictedBordingZone.restrictionType,
        disallowedDirection: restrictedBordingZone.disallowedDirection,
        polyline: restrictedBordingZone.polyline,
        isPublic: restrictedBordingZone.isPublic,
        pointsGeometry: restrictedBordingZone.points,
        routeIds: sql<string[]>`
          COALESCE(
            json_agg(DISTINCT ${routeRestrictedInBoardingZone.routeId}) FILTER (WHERE ${routeRestrictedInBoardingZone.routeId} IS NOT NULL),
            '[]'::json
          )
        `,
      })
        .from(restrictedBordingZone)
        .leftJoin(
          routeRestrictedInBoardingZone,
          eq(routeRestrictedInBoardingZone.restrictionZoneId, restrictedBordingZone.id),
        )
        .groupBy(
          restrictedBordingZone.id,
          restrictedBordingZone.name,
          restrictedBordingZone.restrictionType,
          restrictedBordingZone.disallowedDirection,
          restrictedBordingZone.polyline,
          restrictedBordingZone.isPublic,
          restrictedBordingZone.points,
        ),
    ]);

    const [routeSnapshotsByRouteId, regionSnapshotsByRegionId, orphanedRouteSnapshots, orphanedRegionSnapshots] = await Promise.all([
      fetchRouteSnapshotsWithPoints(routeRows.map(r => r.id)),
      fetchRegionSnapshotsByRegionIds(regionRows.map(r => r.id)),
      fetchOrphanedRouteSnapshots(),
      fetchOrphanedRegionSnapshots(),
    ]);

    const payload: ExportPayload = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      vehicleTypes: vehicleTypeRows,
      routes: routeRows.map(route => ({
        ...route,
        snapshots: routeSnapshotsByRouteId.get(route.id) ?? [],
      })),
      regions: regionRows.map(regionRow => ({
        ...regionRow,
        snapshots: regionSnapshotsByRegionId.get(regionRow.id) ?? [],
      })),
      closures: closureRows.map(({ polygon, ...closure }) => ({
        id: closure.id,
        name: closure.name,
        description: closure.description,
        shape: closure.shape,
        closureType: closure.closureType,
        endDate: closure.endDate ? closure.endDate.toISOString() : null,
        isPublic: closure.isPublic,
        points: polygonToPointObjects(polygon, closure.id).map(({ sequence, point }) => ({
          sequence,
          point,
        })),
      })),
      stops: stopRows.map(stop => ({
        id: stop.id,
        name: stop.name,
        restrictionType: stop.restrictionType,
        disallowedDirection: stop.disallowedDirection,
        polyline: stop.polyline,
        isPublic: stop.isPublic,
        routeIds: stop.routeIds ?? [],
        points: lineStringToStopPoints(stop.pointsGeometry, stop.id).map(({ sequence, point }) => ({
          sequence,
          point,
        })),
      })),
      orphanedSnapshots: {
        routes: orphanedRouteSnapshots,
        regions: orphanedRegionSnapshots,
      },
    };

    return new Success(payload);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export data.", {}, e);
  }
}

export interface ImportSummary {
  vehicleTypes: number;
  routes: number;
  regions: number;
  closures: number;
  stops: number;
}

export async function importData(payload: ImportPayload, ownerId: string): Promise<Result<ImportSummary>> {
  try {
    const vehicleTypeRemapper = new IdRemapper();
    const routeRemapper = new IdRemapper();
    const routeSnapshotRemapper = new IdRemapper();
    const regionRemapper = new IdRemapper();
    const regionSnapshotRemapper = new IdRemapper();

    const summary = await db.transaction(async tx => {
      for (const vehicleType of payload.vehicleTypes) {
        const [existing] = await tx
          .select({ id: vehicleTypes.id })
          .from(vehicleTypes)
          .where(eq(vehicleTypes.name, vehicleType.name))
          .limit(1);

        if (existing) {
          vehicleTypeRemapper.set(vehicleType.id, existing.id);
          continue;
        }

        const [created] = await tx
          .insert(vehicleTypes)
          .values({
            ownerId,
            name: vehicleType.name,
            requiresRoute: vehicleType.requiresRoute,
          })
          .returning({ id: vehicleTypes.id });

        if (!created) throw new Error("Failed to create vehicle type.");
        vehicleTypeRemapper.set(vehicleType.id, created.id);
      }

      for (const route of payload.routes) {
        const newRouteId = routeRemapper.remap(route.id);
        const remappedActiveSnapshotId = routeSnapshotRemapper.remap(route.activeSnapshotId);

        await tx.insert(routes).values({
          id: newRouteId,
          ownerId,
          activeSnapshotId: remappedActiveSnapshotId,
          vehicleTypeId: vehicleTypeRemapper.get(route.vehicleTypeId) ?? route.vehicleTypeId,
          routeNumber: route.routeNumber,
          routeName: route.routeName,
          routeColor: route.routeColor,
          routeDetails: route.routeDetails,
          availableFrom: route.availableFrom,
          availableTo: route.availableTo,
          fleetCount: route.fleetCount,
          polylineGoingTo: route.polylineGoingTo,
          polylineGoingBack: route.polylineGoingBack,
          isPublic: route.isPublic,
        });

        for (const snapshot of route.snapshots) {
          const newSnapshotId = routeSnapshotRemapper.remap(snapshot.id);

          await tx.insert(routeSnapshots).values({
            id: newSnapshotId,
            ownerId,
            routeId: newRouteId,
            versionName: snapshot.versionName,
            snapshotState: snapshot.snapshotState,
            vehicleTypeId: vehicleTypeRemapper.get(snapshot.vehicleTypeId) ?? snapshot.vehicleTypeId,
            routeNumber: snapshot.routeNumber,
            routeName: snapshot.routeName,
            routeColor: snapshot.routeColor,
            routeDetails: snapshot.routeDetails,
            availableFrom: snapshot.availableFrom,
            availableTo: snapshot.availableTo,
            fleetCount: snapshot.fleetCount,
            polylineGoingTo: snapshot.polylineGoingTo,
            polylineGoingBack: snapshot.polylineGoingBack,
          });

          const sequenceRows = [
            ...snapshot.points.goingTo.map(point => ({
              routeSnapshotId: newSnapshotId,
              sequenceType: "going_to" as const,
              sequenceNumber: point.sequence,
              address: point.address,
              point: toDbPoint(point.point),
            })),
            ...snapshot.points.goingBack.map(point => ({
              routeSnapshotId: newSnapshotId,
              sequenceType: "going_back" as const,
              sequenceNumber: point.sequence,
              address: point.address,
              point: toDbPoint(point.point),
            })),
          ];

          if (sequenceRows.length > 0) {
            await tx.insert(routeSequences).values(sequenceRows);
          }
        }

        const activeSnapshotExists = route.snapshots.some(s => s.id === route.activeSnapshotId);
        if (!activeSnapshotExists) {
          throw new Error(`Route ${route.id} references missing active snapshot ${route.activeSnapshotId}.`);
        }

        await tx
          .update(routes)
          .set({ activeSnapshotId: routeSnapshotRemapper.get(route.activeSnapshotId)! })
          .where(eq(routes.id, newRouteId));
      }

      for (const regionRow of payload.regions) {
        const newRegionId = regionRemapper.remap(regionRow.id);
        const remappedActiveSnapshotId = regionSnapshotRemapper.remap(regionRow.activeSnapshotId);

        await tx.insert(region).values({
          id: newRegionId,
          ownerId,
          activeSnapshotId: remappedActiveSnapshotId,
          name: regionRow.regionName,
          color: regionRow.color,
          shapeType: regionRow.shapeType,
          isPublic: regionRow.isPublic,
        });

        for (const snapshot of regionRow.snapshots) {
          const newSnapshotId = regionSnapshotRemapper.remap(snapshot.id);

          await tx.insert(regionSnapshots).values({
            id: newSnapshotId,
            ownerId,
            regionId: newRegionId,
            versionName: snapshot.versionName,
            snapshotState: snapshot.snapshotState,
            name: snapshot.regionName,
            color: snapshot.color,
            shapeType: snapshot.shapeType,
          });

          if (snapshot.points.length > 0) {
            await tx.insert(regionSequences).values(
              snapshot.points.map(point => ({
                regionSnapshotId: newSnapshotId,
                sequenceNumber: point.sequence,
                point: toDbPoint(point.point),
              })),
            );
          }

          if (snapshot.stations.length > 0) {
            await tx.insert(regionStations).values(
              snapshot.stations.map(station => ({
                regionSnapshotId: newSnapshotId,
                address: station.address,
                availableFrom: toUtcTime(station.availableFrom),
                availableTo: toUtcTime(station.availableTo),
                point: toDbPoint(station.point),
              })),
            );
          }
        }

        const activeSnapshotExists = regionRow.snapshots.some(s => s.id === regionRow.activeSnapshotId);
        if (!activeSnapshotExists) {
          throw new Error(`Region ${regionRow.id} references missing active snapshot ${regionRow.activeSnapshotId}.`);
        }

        await tx
          .update(region)
          .set({ activeSnapshotId: regionSnapshotRemapper.get(regionRow.activeSnapshotId)! })
          .where(eq(region.id, newRegionId));
      }

      for (const closure of payload.closures) {
        const [created] = await tx
          .insert(roadClosures)
          .values({
            ownerId,
            name: closure.name,
            description: closure.description,
            shape: closure.shape,
            closureType: closure.closureType,
            endDate: closure.endDate ? new Date(closure.endDate) : null,
            isPublic: closure.isPublic,
            polygon: closure.points.length > 0 ? pointsToPolygon(closure.points) : null,
          })
          .returning({ id: roadClosures.id });

        if (!created) throw new Error("Failed to create closure.");
      }

      for (const stop of payload.stops) {
        const [created] = await tx
          .insert(restrictedBordingZone)
          .values({
            ownerId,
            name: stop.name,
            restrictionType: stop.restrictionType,
            disallowedDirection: stop.disallowedDirection,
            polyline: stop.polyline,
            points: stop.points.length > 0 ? pointsToLineString(stop.points) : null,
            isPublic: stop.isPublic,
          })
          .returning({ id: restrictedBordingZone.id });

        if (!created) throw new Error("Failed to create stop.");

        const remappedRouteIds = stop.routeIds
          .map(routeId => routeRemapper.get(routeId))
          .filter((routeId): routeId is string => Boolean(routeId));

        if (remappedRouteIds.length > 0) {
          await tx.insert(routeRestrictedInBoardingZone).values(
            remappedRouteIds.map(routeId => ({
              restrictionZoneId: created.id,
              routeId,
            })),
          );
        }
      }

      return {
        vehicleTypes: payload.vehicleTypes.length,
        routes: payload.routes.length,
        regions: payload.regions.length,
        closures: payload.closures.length,
        stops: payload.stops.length,
      } satisfies ImportSummary;
    });

    return new Success(summary);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to import data.", {}, e);
  }
}

export interface SnapshotCleanupStats {
  orphanedRouteSnapshots: number;
  orphanedRegionSnapshots: number;
  unusedRouteSnapshots: number;
  unusedRegionSnapshots: number;
}

export async function getSnapshotCleanupStats(): Promise<Result<SnapshotCleanupStats>> {
  try {
    const allRouteIds = (await db.select({ id: routes.id }).from(routes)).map(r => r.id);
    const allRegionIds = (await db.select({ id: region.id }).from(region)).map(r => r.id);
    const activeRouteSnapshotIds = (await db.select({ id: routes.activeSnapshotId }).from(routes)).map(r => r.id);
    const activeRegionSnapshotIds = (await db.select({ id: region.activeSnapshotId }).from(region)).map(r => r.id);

    const orphanedRouteSnapshotsResult = allRouteIds.length === 0
      ? await db.select({ count: sql<number>`count(*)::int` }).from(routeSnapshots)
      : await db
        .select({ count: sql<number>`count(*)::int` })
        .from(routeSnapshots)
        .where(notInArray(routeSnapshots.routeId, allRouteIds));

    const orphanedRegionSnapshotsResult = allRegionIds.length === 0
      ? await db.select({ count: sql<number>`count(*)::int` }).from(regionSnapshots)
      : await db
        .select({ count: sql<number>`count(*)::int` })
        .from(regionSnapshots)
        .where(notInArray(regionSnapshots.regionId, allRegionIds));

    const unusedRouteSnapshots = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(routeSnapshots)
      .where(and(
        inArray(routeSnapshots.snapshotState, ["wip", "for_approval"]),
        allRouteIds.length > 0 ? inArray(routeSnapshots.routeId, allRouteIds) : sql`false`,
        activeRouteSnapshotIds.length > 0
          ? notInArray(routeSnapshots.id, activeRouteSnapshotIds)
          : sql`true`,
      ));

    const unusedRegionSnapshots = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(regionSnapshots)
      .where(and(
        inArray(regionSnapshots.snapshotState, ["wip", "for_approval"]),
        allRegionIds.length > 0 ? inArray(regionSnapshots.regionId, allRegionIds) : sql`false`,
        activeRegionSnapshotIds.length > 0
          ? notInArray(regionSnapshots.id, activeRegionSnapshotIds)
          : sql`true`,
      ));

    return new Success({
      orphanedRouteSnapshots: orphanedRouteSnapshotsResult[0]?.count ?? 0,
      orphanedRegionSnapshots: orphanedRegionSnapshotsResult[0]?.count ?? 0,
      unusedRouteSnapshots: unusedRouteSnapshots[0]?.count ?? 0,
      unusedRegionSnapshots: unusedRegionSnapshots[0]?.count ?? 0,
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch snapshot cleanup stats.", {}, e);
  }
}

export interface SnapshotDeleteSummary {
  routeSnapshotsDeleted: number;
  regionSnapshotsDeleted: number;
}

export async function deleteOrphanedSnapshots(): Promise<Result<SnapshotDeleteSummary>> {
  try {
    const allRouteIds = (await db.select({ id: routes.id }).from(routes)).map(r => r.id);
    const allRegionIds = (await db.select({ id: region.id }).from(region)).map(r => r.id);

    let routeSnapshotsDeleted = 0;
    if (allRouteIds.length === 0) {
      const deleted = await db.delete(routeSnapshots).returning({ id: routeSnapshots.id });
      routeSnapshotsDeleted = deleted.length;
    } else {
      const deleted = await db
        .delete(routeSnapshots)
        .where(notInArray(routeSnapshots.routeId, allRouteIds))
        .returning({ id: routeSnapshots.id });
      routeSnapshotsDeleted = deleted.length;
    }

    let regionSnapshotsDeleted = 0;
    if (allRegionIds.length === 0) {
      const deleted = await db.delete(regionSnapshots).returning({ id: regionSnapshots.id });
      regionSnapshotsDeleted = deleted.length;
    } else {
      const deleted = await db
        .delete(regionSnapshots)
        .where(notInArray(regionSnapshots.regionId, allRegionIds))
        .returning({ id: regionSnapshots.id });
      regionSnapshotsDeleted = deleted.length;
    }

    return new Success({ routeSnapshotsDeleted, regionSnapshotsDeleted });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete orphaned snapshots.", {}, e);
  }
}

export async function deleteUnusedSnapshots(): Promise<Result<SnapshotDeleteSummary>> {
  try {
    const allRouteIds = (await db.select({ id: routes.id }).from(routes)).map(r => r.id);
    const allRegionIds = (await db.select({ id: region.id }).from(region)).map(r => r.id);
    const activeRouteSnapshotIds = (await db.select({ id: routes.activeSnapshotId }).from(routes)).map(r => r.id);
    const activeRegionSnapshotIds = (await db.select({ id: region.activeSnapshotId }).from(region)).map(r => r.id);

    let routeSnapshotsDeleted = 0;
    if (allRouteIds.length > 0) {
      const deleted = await db
        .delete(routeSnapshots)
        .where(and(
          inArray(routeSnapshots.snapshotState, ["wip", "for_approval"]),
          inArray(routeSnapshots.routeId, allRouteIds),
          activeRouteSnapshotIds.length > 0
            ? notInArray(routeSnapshots.id, activeRouteSnapshotIds)
            : sql`true`,
        ))
        .returning({ id: routeSnapshots.id });
      routeSnapshotsDeleted = deleted.length;
    }

    let regionSnapshotsDeleted = 0;
    if (allRegionIds.length > 0) {
      const deleted = await db
        .delete(regionSnapshots)
        .where(and(
          inArray(regionSnapshots.snapshotState, ["wip", "for_approval"]),
          inArray(regionSnapshots.regionId, allRegionIds),
          activeRegionSnapshotIds.length > 0
            ? notInArray(regionSnapshots.id, activeRegionSnapshotIds)
            : sql`true`,
        ))
        .returning({ id: regionSnapshots.id });
      regionSnapshotsDeleted = deleted.length;
    }

    return new Success({ routeSnapshotsDeleted, regionSnapshotsDeleted });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete unused snapshots.", {}, e);
  }
}
