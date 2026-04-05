"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import RouteItemSidebar from "@/components/route-item-sidebar";
import RouteEditor from "@/components/route-editor";
import RouteListCard from "@/components/route-list-card";
import { type SnapshotListItem } from "@/components/snapshot-types";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ClosureEditorProvider } from "@/contexts/ClosureEditorContext";
import { RouteEditorProvider, useRouteEditor } from "@/contexts/RouteEditorContext";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";

import RouteMapComponent from "./MapComponent";

function RouteDashboardContent() {
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(true);
  const [areRouteLayersReady, setAreRouteLayersReady] = useState(false);
  const [routes, setRoutes] = useState<AllResponse["routes"]>([]);
  const [selectedRoute, setSelectedRoute] = useState<AllResponse["routes"][0] | null>(null);
  const [editingRoute, setEditingRoute] = useState<AllResponse["routes"][0] | null>(null);
  const [routeFocusKey, setRouteFocusKey] = useState<string | number | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotActing, setIsSnapshotActing] = useState(false);
  const [isDeletingRoute, setIsDeletingRoute] = useState(false);
  const [routeSnapshots, setRouteSnapshots] = useState<SnapshotListItem[]>([]);
  const [selectedRouteSnapshotId, setSelectedRouteSnapshotId] = useState<string | null>(null);
  const [activeRouteSnapshotId, setActiveRouteSnapshotId] = useState<string | null>(null);
  const [snapshotCreateParentRouteId, setSnapshotCreateParentRouteId] = useState<string | null>(null);
  const selectedRouteRef = useRef<AllResponse["routes"][0] | null>(null);

  const { isCreating, startCreating, startEditing, stopCreating } = useRouteEditor();

  const persistedRouting = useMemo(
    () => routes.flatMap((route) => [
      route.points.polylineGoingTo
        ? { color: route.routeColor, polyline: route.points.polylineGoingTo }
        : null,
      route.points.polylineGoingBack
        ? { color: route.routeColor, polyline: route.points.polylineGoingBack }
        : null,
    ].filter((entry): entry is { color: string; polyline: string } => entry !== null)),
    [routes],
  );

  const mapRouting = useMemo(() => {
    if (!selectedRoute) {
      return persistedRouting;
    }

    return [
      selectedRoute.points.polylineGoingTo
        ? { color: selectedRoute.routeColor, polyline: selectedRoute.points.polylineGoingTo }
        : null,
      selectedRoute.points.polylineGoingBack
        ? { color: selectedRoute.routeColor, polyline: selectedRoute.points.polylineGoingBack }
        : null,
    ].filter((entry): entry is { color: string; polyline: string } => entry !== null);
  }, [persistedRouting, selectedRoute]);

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  const loadRouteSnapshots = useCallback(async (route: AllResponse["routes"][0]) => {
    setIsSnapshotLoading(true);
    const { data, error } = await $fetch<IApiResponse<SnapshotListItem[]>>(`/api/restricted/management/route/${route.id}/snapshots`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load route snapshots:", error);
      setIsSnapshotLoading(false);
      return;
    }

    setRouteSnapshots(data.data);
    setSelectedRouteSnapshotId(route.activeSnapshotId);
    setActiveRouteSnapshotId(route.activeSnapshotId);
    setIsSnapshotLoading(false);
  }, []);

  const fetchRoutes = useCallback(async () => {
    setIsFetchingRoutes(true);
    setAreRouteLayersReady(false);
    setRoutes([]);

    const { data, error } = await $fetch<IApiResponse<AllResponse["routes"]>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch routes:", error);
      setIsFetchingRoutes(false);
      setAreRouteLayersReady(true);
      return;
    }

    const nextRoutes = data.data;
    setRoutes(nextRoutes);

    if (selectedRouteRef.current) {
      const refreshedRoute = nextRoutes.find((route) => route.id === selectedRouteRef.current?.id) ?? null;
      setSelectedRoute(refreshedRoute);
      if (!refreshedRoute) {
        setEditingRoute(null);
        setRouteSnapshots([]);
        setSelectedRouteSnapshotId(null);
        setActiveRouteSnapshotId(null);
      } else {
        setActiveRouteSnapshotId(refreshedRoute.activeSnapshotId);
        void loadRouteSnapshots(refreshedRoute);
      }
    }

    setIsFetchingRoutes(false);
  }, [loadRouteSnapshots]);

  const isRoutesLoading = isFetchingRoutes || !areRouteLayersReady;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchRoutes();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchRoutes]);

  const fetchRouteSnapshot = async (routeId: string, snapshotId: string) => {
    const { data, error } = await $fetch<IApiResponse<AllResponse["routes"][0]>>(`/api/restricted/management/route/${routeId}/${snapshotId}`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load route snapshot:", error);
      return null;
    }

    return data.data;
  };

  const handleShowRoutes = () => {
    if (isCreating) {
      stopCreating();
      setEditingRoute(null);
      setSnapshotCreateParentRouteId(null);
      setRouteFocusKey(null);
      return;
    }

    setEditingRoute(null);
    setSnapshotCreateParentRouteId(null);
    setRouteFocusKey(null);
    startCreating();
  };

  const handleSelectRoute = (route: AllResponse["routes"][0]) => {
    setRouteFocusKey(`${route.id}-${Date.now()}`);
    setSelectedRoute(route);
    setEditingRoute(null);
    setSnapshotCreateParentRouteId(null);
    stopCreating();
    void loadRouteSnapshots(route);
  };

  const handleClearSelectedRoute = () => {
    setSelectedRoute(null);
    setEditingRoute(null);
    setSelectedRouteSnapshotId(null);
    setSnapshotCreateParentRouteId(null);
    setRouteFocusKey(null);
    stopCreating();
  };

  const openRouteEditor = (route: AllResponse["routes"][0]) => {
    setSelectedRoute(route);
    setEditingRoute(route);
    setSnapshotCreateParentRouteId(null);
    startEditing({
      color: route.routeColor,
      points: {
        goingTo: [...route.points.goingTo]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => ({ point: point.point, address: point.address })),
        goingBack: [...route.points.goingBack]
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
    openRouteEditor(routeSnapshot);
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
    openRouteEditor(routeSnapshot);
    setSelectedRouteSnapshotId(data.data.id);
  };

  const handleSetActiveRouteSnapshot = async (snapshotId: string) => {
    if (!selectedRoute) return;

    const selectedSnapshot = routeSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state !== "ready") return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<AllResponse["routes"][0]>>(`/api/restricted/management/route/${selectedRoute.id}`, {
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
    void loadRouteSnapshots(data.data);
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
    setRouteSnapshots(nextSnapshots);
    setSelectedRouteSnapshotId(nextSnapshots[0]?.id ?? null);
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
            focusedWaypoints={selectedRoute
              ? [...selectedRoute.points.goingTo]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point)
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

                if (editingRoute?.id && editingRoute?.activeSnapshotId) {
                  const refreshedSnapshot = await fetchRouteSnapshot(editingRoute.id, editingRoute.activeSnapshotId);
                  if (refreshedSnapshot) {
                    setSelectedRoute(refreshedSnapshot);
                  }
                }
              }}
              onClosed={() => {
                setEditingRoute(null);
                setSnapshotCreateParentRouteId(null);
              }}
            />
          ) : null}
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
