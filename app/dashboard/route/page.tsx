"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import RouteItemSidebar from "@/components/route-item-sidebar";
import RouteEditor from "@/components/route-editor";
import RouteListCard from "@/components/route-list-card";
import type {
  ClosureResponseList,
  RoutePointResponse,
  RouteResponse,
  RouteResponseList,
} from "@/contracts/responses";
import { type SnapshotListItem } from "@/components/snapshot-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { ClosureEditorProvider } from "@/contexts/ClosureEditorContext";
import { RouteEditorProvider, useRouteEditor } from "@/contexts/RouteEditorContext";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";

import RouteMapComponent from "./MapComponent";

const POLYLINE6_PRECISION = 1_000_000;

const decodePolyline6 = (encoded: string): Array<[number, number]> => {
  if (!encoded) return [];

  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coordinates.push([lat / POLYLINE6_PRECISION, lng / POLYLINE6_PRECISION]);
  }

  return coordinates;
};

const isPointInPolygon = (point: [number, number], polygon: Array<[number, number]>): boolean => {
  const [lat, lng] = point;
  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersects = ((latI > lat) !== (latJ > lat))
      && (lng < ((lngJ - lngI) * (lat - latI) / ((latJ - latI) || Number.EPSILON)) + lngI);

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
};

const orientation = (a: [number, number], b: [number, number], c: [number, number]): number => {
  const value = ((b[1] - a[1]) * (c[0] - b[0])) - ((b[0] - a[0]) * (c[1] - b[1]));
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
};

const onSegment = (a: [number, number], b: [number, number], c: [number, number]): boolean => {
  return b[0] <= Math.max(a[0], c[0])
    && b[0] >= Math.min(a[0], c[0])
    && b[1] <= Math.max(a[1], c[1])
    && b[1] >= Math.min(a[1], c[1]);
};

const segmentsIntersect = (
  p1: [number, number],
  q1: [number, number],
  p2: [number, number],
  q2: [number, number],
): boolean => {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
};

const routeLineIntersectsPolygon = (
  line: Array<[number, number]>,
  polygon: Array<[number, number]>,
): boolean => {
  if (line.length < 2 || polygon.length < 3) return false;
  if (line.some((point) => isPointInPolygon(point, polygon))) return true;

  for (let lineIdx = 0; lineIdx < line.length - 1; lineIdx += 1) {
    const lineStart = line[lineIdx];
    const lineEnd = line[lineIdx + 1];

    for (let polygonIdx = 0; polygonIdx < polygon.length; polygonIdx += 1) {
      const polyStart = polygon[polygonIdx];
      const polyEnd = polygon[(polygonIdx + 1) % polygon.length];
      if (segmentsIntersect(lineStart, lineEnd, polyStart, polyEnd)) {
        return true;
      }
    }
  }

  return false;
};

function RouteDashboardContent() {
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(true);
  const [areRouteLayersReady, setAreRouteLayersReady] = useState(false);
  const [routes, setRoutes] = useState<RouteResponseList>([]);
  const [closures, setClosures] = useState<ClosureResponseList>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteResponse | null>(null);
  const [editingRoute, setEditingRoute] = useState<RouteResponse | null>(null);
  const [routeFocusKey, setRouteFocusKey] = useState<string | number | null>(null);
  const [showClosuresOnMap, setShowClosuresOnMap] = useState(true);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotActing, setIsSnapshotActing] = useState(false);
  const [isDeletingRoute, setIsDeletingRoute] = useState(false);
  const [routeSnapshots, setRouteSnapshots] = useState<SnapshotListItem[]>([]);
  const [selectedRouteSnapshotId, setSelectedRouteSnapshotId] = useState<string | null>(null);
  const [activeRouteSnapshotId, setActiveRouteSnapshotId] = useState<string | null>(null);
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [snapshotCreateParentRouteId, setSnapshotCreateParentRouteId] = useState<string | null>(null);
  const [isMapSettingsDialogOpen, setIsMapSettingsDialogOpen] = useState(false);
  const selectedRouteRef = useRef<RouteResponse | null>(null);
  const selectedRouteSnapshotIdRef = useRef<string | null>(null);

  const { isCreating, startCreating, startEditing, stopCreating } = useRouteEditor();

  type RouteManagementResponse = {
    routes: RouteResponseList;
    closures: ClosureResponseList;
  };

  const persistedRouting = useMemo(
    () => routes.flatMap((route) => [
      route.polylines.to
        ? { color: route.routeColor, polyline: route.polylines.to }
        : null,
      route.polylines.back
        ? { color: route.routeColor, polyline: route.polylines.back }
        : null,
    ].filter((entry): entry is { color: string; polyline: string } => entry !== null)),
    [routes],
  );

  const mapRouting = useMemo(() => {
    if (!selectedRoute) {
      return persistedRouting;
    }

    return [
      selectedRoute.polylines.to
        ? { color: selectedRoute.routeColor, polyline: selectedRoute.polylines.to }
        : null,
      selectedRoute.polylines.back
        ? { color: selectedRoute.routeColor, polyline: selectedRoute.polylines.back }
        : null,
    ].filter((entry): entry is { color: string; polyline: string } => entry !== null);
  }, [persistedRouting, selectedRoute]);

  const routeWarningRouteIds = useMemo(() => {
    if (!showClosuresOnMap || closures.length === 0 || routes.length === 0) {
      return new Set<string>();
    }

    const polygons = closures
      .map((closure) => [...closure.points]
        .sort((a, b) => a.sequence - b.sequence)
        .map((point) => [Number(point.point[0]), Number(point.point[1])] as [number, number])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)))
      .filter((polygon) => polygon.length >= 3);

    if (polygons.length === 0) {
      return new Set<string>();
    }

    const warningIds = new Set<string>();

    for (const route of routes) {
      const routeLines: Array<Array<[number, number]>> = [];

      if (route.polylines.to) {
        routeLines.push(decodePolyline6(route.polylines.to));
      }

      if (route.polylines.back) {
        routeLines.push(decodePolyline6(route.polylines.back));
      }

      const hasIntersection = routeLines.some((line) => (
        line.length >= 2
          && polygons.some((polygon) => routeLineIntersectsPolygon(line, polygon))
      ));

      if (hasIntersection) {
        warningIds.add(route.id);
      }
    }

    return warningIds;
  }, [closures, routes, showClosuresOnMap]);

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useEffect(() => {
    selectedRouteSnapshotIdRef.current = selectedRouteSnapshotId;
  }, [selectedRouteSnapshotId]);

  const fetchRouteSnapshot = useCallback(async (routeId: string, snapshotId: string) => {
    const { data, error } = await $fetch<IApiResponse<RouteResponse>>(`/api/restricted/management/route/${routeId}/${snapshotId}`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load route snapshot:", error);
      return null;
    }

    return data.data;
  }, []);

  const loadRouteSnapshots = useCallback(async (route: RouteResponse, preferredSnapshotId?: string | null) => {
    setIsSnapshotLoading(true);
    const { data, error } = await $fetch<IApiResponse<SnapshotListItem[]>>(`/api/restricted/management/route/${route.id}/snapshots`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load route snapshots:", error);
      setIsSnapshotLoading(false);
      return;
    }

    const snapshots = data.data;
    const activeSnapshotId = snapshots.find((snapshot) => snapshot.isActive)?.id ?? null;
    const preferredExists = preferredSnapshotId ? snapshots.some((snapshot) => snapshot.id === preferredSnapshotId) : false;
    const selectedSnapshotId: string | null = preferredExists
      ? preferredSnapshotId ?? null
      : activeSnapshotId ?? snapshots[0]?.id ?? null;

    setRouteSnapshots(snapshots);
    setSelectedRouteSnapshotId(selectedSnapshotId);
    setActiveRouteSnapshotId(activeSnapshotId);
    setIsSnapshotLoading(false);
  }, []);

  const fetchRoutes = useCallback(async () => {
    setIsFetchingRoutes(true);
    setAreRouteLayersReady(false);
    setRoutes([]);

    const { data, error } = await $fetch<IApiResponse<RouteManagementResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch routes:", error);
      setIsFetchingRoutes(false);
      setAreRouteLayersReady(true);
      return;
    }

    const nextRoutes = data.data.routes;
    const nextClosures = data.data.closures;
    setRoutes(nextRoutes);
    setClosures(nextClosures);

    if (selectedRouteRef.current) {
      const preservedSnapshotId = selectedRouteSnapshotIdRef.current;
      const refreshedRoute = nextRoutes.find((route) => route.id === selectedRouteRef.current?.id) ?? null;
      if (!refreshedRoute) {
        setSelectedRoute(null);
        setEditingRoute(null);
        setEditingSnapshotId(null);
        setRouteSnapshots([]);
        setSelectedRouteSnapshotId(null);
        setActiveRouteSnapshotId(null);
      } else {
        const preservedSnapshot = preservedSnapshotId
          ? await fetchRouteSnapshot(refreshedRoute.id, preservedSnapshotId)
          : null;

        setSelectedRoute(preservedSnapshot ?? refreshedRoute);
        void loadRouteSnapshots(refreshedRoute, preservedSnapshotId);
      }
    }

    setIsFetchingRoutes(false);
  }, [fetchRouteSnapshot, loadRouteSnapshots]);

  const isRoutesLoading = isFetchingRoutes || !areRouteLayersReady;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchRoutes();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchRoutes]);

  const fetchRouteSnapshotPoints = async (routeId: string, snapshotId: string) => {
    const { data, error } = await $fetch<IApiResponse<RoutePointResponse>>(`/api/restricted/management/route/${routeId}/${snapshotId}/points`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load route snapshot points:", error);
      return null;
    }

    return data.data;
  };

  const handleShowRoutes = () => {
    if (isCreating) {
      stopCreating();
      setEditingRoute(null);
      setEditingSnapshotId(null);
      setSnapshotCreateParentRouteId(null);
      setRouteFocusKey(null);
      return;
    }

    setShowClosuresOnMap(true);
    setEditingRoute(null);
    setEditingSnapshotId(null);
    setSnapshotCreateParentRouteId(null);
    setRouteFocusKey(null);
    startCreating();
  };

  const handleSelectRoute = (route: RouteResponse) => {
    setRouteFocusKey(`${route.id}-${Date.now()}`);
    setSelectedRoute(route);
    setEditingRoute(null);
    setEditingSnapshotId(null);
    setSnapshotCreateParentRouteId(null);
    stopCreating();
    void loadRouteSnapshots(route);
  };

  const handleClearSelectedRoute = () => {
    setSelectedRoute(null);
    setEditingRoute(null);
    setEditingSnapshotId(null);
    setSelectedRouteSnapshotId(null);
    setSnapshotCreateParentRouteId(null);
    setRouteFocusKey(null);
    stopCreating();
  };

  const openRouteEditor = async (route: RouteResponse, snapshotId: string) => {
    setShowClosuresOnMap(true);
    setSelectedRoute(route);
    setEditingRoute(route);
    setEditingSnapshotId(snapshotId);
    setSnapshotCreateParentRouteId(null);

    const points = await fetchRouteSnapshotPoints(route.id, snapshotId);
    if (!points) {
      setEditingRoute(null);
      setEditingSnapshotId(null);
      return;
    }

    startEditing({
      color: route.routeColor,
      points: {
        goingTo: [...points.goingTo]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => ({ point: point.point, address: point.address })),
        goingBack: [...points.goingBack]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => ({ point: point.point, address: point.address })),
      },
    });
  };

  const handleDeleteRoute = async () => {
    if (!selectedRoute || isDeletingRoute) return;

    const shouldDelete = window.confirm("Delete this route and all its snapshots? This action cannot be undone.");
    if (!shouldDelete) return;

    setIsDeletingRoute(true);
    const { error } = await $fetch(`/api/restricted/management/route/${selectedRoute.id}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete route:", error);
      setIsDeletingRoute(false);
      return;
    }

    setSelectedRoute(null);
    setEditingRoute(null);
    setEditingSnapshotId(null);
    setSelectedRouteSnapshotId(null);
    setActiveRouteSnapshotId(null);
    stopCreating();
    setRouteFocusKey(null);

    await fetchRoutes();
    setIsDeletingRoute(false);
  };

  const handleViewRouteSnapshot = async (snapshotId: string) => {
    if (!selectedRoute) return;
    setIsSnapshotActing(true);
    const routeSnapshot = await fetchRouteSnapshot(selectedRoute.id, snapshotId);
    setIsSnapshotActing(false);
    if (!routeSnapshot) return;

    setRouteFocusKey(`${routeSnapshot.id}-${Date.now()}`);
    setSelectedRoute(routeSnapshot);
    setEditingRoute(null);
    setEditingSnapshotId(null);
    setSelectedRouteSnapshotId(snapshotId);
    stopCreating();
  };

  const handleEditRouteSnapshot = async (snapshotId: string) => {
    if (!selectedRoute) return;

    const selectedSnapshot = routeSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state === "ready") return;

    setIsSnapshotActing(true);
    const routeSnapshot = await fetchRouteSnapshot(selectedRoute.id, snapshotId);
    setIsSnapshotActing(false);
    if (!routeSnapshot) return;

    setRouteFocusKey(`${routeSnapshot.id}-${Date.now()}`);
    await openRouteEditor(routeSnapshot, snapshotId);
  };

  const handleCloneRouteSnapshot = async (snapshotId: string) => {
    if (!selectedRoute) return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<SnapshotListItem>>(`/api/restricted/management/route/${selectedRoute.id}/${snapshotId}`, {
      method: "PUT",
    });
    if (error) {
      console.error("Failed to clone route snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    const routeSnapshot = await fetchRouteSnapshot(selectedRoute.id, data.data.id);
    setIsSnapshotActing(false);
    if (!routeSnapshot) return;

    setRouteFocusKey(`${routeSnapshot.id}-${Date.now()}`);
    await openRouteEditor(routeSnapshot, data.data.id);
    setSelectedRouteSnapshotId(data.data.id);
  };

  const handleSetActiveRouteSnapshot = async (snapshotId: string) => {
    if (!selectedRoute) return;

    const selectedSnapshot = routeSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state !== "ready") return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<RouteResponse>>(`/api/restricted/management/route/${selectedRoute.id}`, {
      method: "PATCH",
      body: { snapshotId },
    });

    if (error) {
      console.error("Failed to switch route snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    setSelectedRoute(data.data);
    setSelectedRouteSnapshotId(snapshotId);
    setActiveRouteSnapshotId(snapshotId);
    setRouteFocusKey(`${data.data.id}-${Date.now()}`);
    setIsSnapshotActing(false);
    void loadRouteSnapshots(data.data, snapshotId);
  };

  const handleCreateBlankRouteSnapshot = () => {
    if (!selectedRoute) return;
    setRouteFocusKey(null);
    setEditingRoute(null);
    setSnapshotCreateParentRouteId(selectedRoute.id);
    startCreating();
  };

  const handleDeleteRouteSnapshot = async (snapshotId: string) => {
    if (!selectedRoute) return;

    const selectedSnapshot = routeSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state === "ready") return;

    const shouldDelete = window.confirm(`Delete snapshot \"${selectedSnapshot.name}\"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setIsSnapshotActing(true);
    const { error } = await $fetch(`/api/restricted/management/route/${selectedRoute.id}/${snapshotId}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete route snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    const nextSnapshots = routeSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    const nextActiveSnapshotId = nextSnapshots.find((snapshot) => snapshot.isActive)?.id ?? null;
    setRouteSnapshots(nextSnapshots);
    setSelectedRouteSnapshotId(nextActiveSnapshotId ?? nextSnapshots[0]?.id ?? null);
    setActiveRouteSnapshotId(nextActiveSnapshotId);
    setIsSnapshotActing(false);
    await fetchRoutes();
  };

  const handleSelectRouteSnapshot = async (snapshotId: string) => {
    setSelectedRouteSnapshotId(snapshotId);
    await handleViewRouteSnapshot(snapshotId);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <RouteMapComponent
            isRoutesLoading={isRoutesLoading}
            onRoutesReadyChange={setAreRouteLayersReady}
            routing={mapRouting}
            closures={closures}
            showClosuresOnMap={showClosuresOnMap}
            focusedWaypoints={selectedRoute
              ? decodePolyline6(selectedRoute.polylines.to)
              : undefined}
            focusKey={routeFocusKey}
          />
          <RouteListCard
            mode="routes"
            routes={routes}
            regions={[]}
            closures={[]}
            isRoutesLoading={isRoutesLoading}
            selectedRouteId={selectedRoute?.id ?? null}
            selectedRegionId={null}
            selectedClosureId={null}
            onRouteSelect={handleSelectRoute}
            onAddRoute={handleShowRoutes}
            onOpenRouteMapSettings={() => setIsMapSettingsDialogOpen(true)}
            routeMapSettingsLabel="Map Settings"
            routeWarningRouteIds={routeWarningRouteIds}
          />

          {selectedRoute ? (
            <div
              className={`absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 ${
                isCreating ? "pointer-events-none -translate-x-6 opacity-0" : "translate-x-0 opacity-100"
              }`}
            >
              <RouteItemSidebar
                route={selectedRoute}
                snapshots={routeSnapshots}
                selectedSnapshotId={selectedRouteSnapshotId}
                activeSnapshotId={activeRouteSnapshotId}
                isSnapshotLoading={isSnapshotLoading}
                isSnapshotActing={isSnapshotActing}
                isDeletingRoute={isDeletingRoute}
                onClose={handleClearSelectedRoute}
                onDeleteRoute={handleDeleteRoute}
                onSelectSnapshot={handleSelectRouteSnapshot}
                onSetActiveSnapshot={handleSetActiveRouteSnapshot}
                onDeleteSnapshot={handleDeleteRouteSnapshot}
                onEditSnapshot={handleEditRouteSnapshot}
                onCloneSnapshot={handleCloneRouteSnapshot}
                onCreateBlankSnapshot={handleCreateBlankRouteSnapshot}
              />
            </div>
          ) : null}

          {isCreating ? (
            <RouteEditor
              editingRoute={editingRoute}
              snapshotParentRouteId={snapshotCreateParentRouteId}
              onSaved={async () => {
                await fetchRoutes();

                if (editingRoute?.id && editingSnapshotId) {
                  const refreshedSnapshot = await fetchRouteSnapshot(editingRoute.id, editingSnapshotId);
                  if (refreshedSnapshot) {
                    setSelectedRoute(refreshedSnapshot);
                    await loadRouteSnapshots(refreshedSnapshot, editingSnapshotId);
                  }
                }
              }}
              onClosed={() => {
                setEditingRoute(null);
                setEditingSnapshotId(null);
                setSnapshotCreateParentRouteId(null);
              }}
              editingSnapshot={routeSnapshots.find((snapshot) => snapshot.id === editingSnapshotId) ?? null}
              editingSnapshotId={editingSnapshotId}
            />
          ) : null}

          <Dialog open={isMapSettingsDialogOpen} onOpenChange={setIsMapSettingsDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Map Settings</DialogTitle>
                <DialogDescription>
                  Control route-editor map overlays.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-1">
                  <Label htmlFor="show-road-closures">Show road closures on map</Label>
                  <p className="text-muted-foreground text-xs">
                    Displays active, ready closures while editing this route.
                  </p>
                </div>
                <Switch
                  id="show-road-closures"
                  checked={showClosuresOnMap}
                  onCheckedChange={setShowClosuresOnMap}
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function RouteDashboardPage() {
  return (
    <RouteEditorProvider>
      <ClosureEditorProvider>
        <RouteDashboardContent />
      </ClosureEditorProvider>
    </RouteEditorProvider>
  );
}
