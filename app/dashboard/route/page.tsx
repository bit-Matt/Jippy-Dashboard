"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import ClosureRegionEditor from "@/components/closure-region-editor";
import RouteEditor from "@/components/route-editor";
import RouteListCard from "@/components/route-list-card";
import SnapshotManagerDialog, { type SnapshotListItem } from "@/components/snapshot-manager-dialog";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ClosureEditorProvider, useClosureEditor } from "@/contexts/ClosureEditorContext";
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
  const [closures, setClosures] = useState<AllResponse["closures"]>([]);
  const [selectedClosure, setSelectedClosure] = useState<AllResponse["closures"][0] | null>(null);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);
  const [routeFocusKey, setRouteFocusKey] = useState<string | number | null>(null);
  const [isRouteSnapshotDialogOpen, setIsRouteSnapshotDialogOpen] = useState(false);
  const [isClosureSnapshotDialogOpen, setIsClosureSnapshotDialogOpen] = useState(false);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotActing, setIsSnapshotActing] = useState(false);
  const [routeSnapshots, setRouteSnapshots] = useState<SnapshotListItem[]>([]);
  const [closureSnapshots, setClosureSnapshots] = useState<SnapshotListItem[]>([]);
  const [selectedRouteSnapshotId, setSelectedRouteSnapshotId] = useState<string | null>(null);
  const [selectedClosureSnapshotId, setSelectedClosureSnapshotId] = useState<string | null>(null);
  const selectedRouteRef = useRef<AllResponse["routes"][0] | null>(null);
  const selectedClosureRef = useRef<AllResponse["closures"][0] | null>(null);

  const { isCreating, startCreating, startEditing, stopCreating } = useRouteEditor();
  const {
    mode: closureMode,
    startCreating: startCreatingClosure,
    startEditing: startEditingClosure,
    stopEditing: stopClosureEditing,
  } = useClosureEditor();

  const selectedModeLabel = isCreating
    ? (editingRoute ? "Edit Mode" : "Create Mode")
    : closureMode === "editing"
      ? "Edit Mode"
      : closureMode === "creating"
        ? "Create Mode"
        : (selectedRoute || selectedClosure)
          ? "View Mode"
          : null;

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

  useEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useEffect(() => {
    selectedClosureRef.current = selectedClosure;
  }, [selectedClosure]);

  const fetchRoutes = useCallback(async () => {
    setIsFetchingRoutes(true);
    setAreRouteLayersReady(false);
    setRoutes([]);

    const { data, error } = await $fetch<IApiResponse<AllResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch routes:", error);
      setIsFetchingRoutes(false);
      setAreRouteLayersReady(true);
      return;
    }

    const nextRoutes = data.data.routes;
    const nextClosures = data.data.closures ?? [];

    setRoutes(nextRoutes);
    setClosures(nextClosures);

    if (selectedRouteRef.current) {
      const refreshedRoute = nextRoutes.find((route) => route.id === selectedRouteRef.current?.id) ?? null;
      setSelectedRoute(refreshedRoute);
      if (!refreshedRoute) {
        setEditingRoute(null);
      }
    }

    if (selectedClosureRef.current) {
      const refreshedClosure = nextClosures.find((closure) => closure.id === selectedClosureRef.current?.id) ?? null;
      setSelectedClosure(refreshedClosure);
      setSelectedClosureId(refreshedClosure?.id ?? null);
    }

    setIsFetchingRoutes(false);
  }, []);

  const isRoutesLoading = isFetchingRoutes || !areRouteLayersReady;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchRoutes();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchRoutes]);

  const handleShowRoutes = () => {
    stopClosureEditing();
    setSelectedClosureId(null);
    setSelectedClosure(null);

    if (isCreating) {
      stopCreating();
      setEditingRoute(null);
      setRouteFocusKey(null);
      return;
    }

    setEditingRoute(null);
    setRouteFocusKey(null);
    startCreating();
  };

  const handleShowClosureRegion = () => {
    if (isCreating) {
      stopCreating();
      setEditingRoute(null);
      setRouteFocusKey(null);
    }

    setSelectedClosureId(null);
    setSelectedClosure(null);
    setSelectedRoute(null);
    startCreatingClosure();
  };

  const handleSelectClosure = (closure: AllResponse["closures"][0]) => {
    setRouteFocusKey(null);
    setEditingRoute(null);
    stopCreating();
    stopClosureEditing();

    setSelectedRoute(null);
    setSelectedClosure(closure);
    setSelectedClosureId(closure.id);
  };

  const handleSelectRoute = (route: AllResponse["routes"][0]) => {
    stopClosureEditing();
    setSelectedClosureId(null);
    setSelectedClosure(null);
    setRouteFocusKey(`${route.id}-${Date.now()}`);
    setSelectedRoute(route);
    setEditingRoute(null);
    stopCreating();
  };

  const openRouteEditor = (route: AllResponse["routes"][0]) => {
    setSelectedRoute(route);
    setEditingRoute(route);
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

  const openClosureEditor = (closure: AllResponse["closures"][0]) => {
    setSelectedClosure(closure);
    setSelectedClosureId(closure.id);
    startEditingClosure(closure);
  };

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

  const fetchClosureSnapshot = async (closureId: string, snapshotId: string) => {
    const { data, error } = await $fetch<IApiResponse<AllResponse["closures"][0]>>(`/api/restricted/management/closure/${closureId}/${snapshotId}`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load closure snapshot:", error);
      return null;
    }

    return data.data;
  };

  const handleManageSnapshots = async () => {
    if (selectedRoute) {
      setIsRouteSnapshotDialogOpen(true);
      setIsSnapshotLoading(true);
      const { data, error } = await $fetch<IApiResponse<SnapshotListItem[]>>(`/api/restricted/management/route/${selectedRoute.id}/snapshots`, {
        method: "GET",
      });
      if (!error) {
        setRouteSnapshots(data.data);
        setSelectedRouteSnapshotId(selectedRoute.activeSnapshotId);
      }
      setIsSnapshotLoading(false);
      return;
    }

    if (selectedClosure) {
      setIsClosureSnapshotDialogOpen(true);
      setIsSnapshotLoading(true);
      const { data, error } = await $fetch<IApiResponse<SnapshotListItem[]>>(`/api/restricted/management/closure/${selectedClosure.id}/snapshots`, {
        method: "GET",
      });
      if (!error) {
        setClosureSnapshots(data.data);
        setSelectedClosureSnapshotId(selectedClosure.activeSnapshotId);
      }
      setIsSnapshotLoading(false);
    }
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
    setIsRouteSnapshotDialogOpen(false);
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
    setIsRouteSnapshotDialogOpen(false);
  };

  const handleSwitchRouteSnapshot = async (snapshotId: string) => {
    if (!selectedRoute) return;

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

    setRouteFocusKey(`${data.data.id}-${Date.now()}`);
    setSelectedRoute(data.data);
    setSelectedRouteSnapshotId(snapshotId);
    setIsSnapshotActing(false);
    setIsRouteSnapshotDialogOpen(false);
    await fetchRoutes();
  };

  const handleViewClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;
    setIsSnapshotActing(true);
    const closureSnapshot = await fetchClosureSnapshot(selectedClosure.id, snapshotId);
    setIsSnapshotActing(false);
    if (!closureSnapshot) return;

    setSelectedClosure(closureSnapshot);
    setSelectedClosureId(closureSnapshot.id);
    stopClosureEditing();
  };

  const handleEditClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;
    const selectedSnapshot = closureSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state === "ready") return;

    setIsSnapshotActing(true);
    const closureSnapshot = await fetchClosureSnapshot(selectedClosure.id, snapshotId);
    setIsSnapshotActing(false);
    if (!closureSnapshot) return;

    openClosureEditor(closureSnapshot);
    setIsClosureSnapshotDialogOpen(false);
  };

  const handleCloneClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<SnapshotListItem>>(`/api/restricted/management/closure/${selectedClosure.id}/${snapshotId}`, {
      method: "PUT",
    });
    if (error) {
      console.error("Failed to clone closure snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    const closureSnapshot = await fetchClosureSnapshot(selectedClosure.id, data.data.id);
    setIsSnapshotActing(false);
    if (!closureSnapshot) return;

    openClosureEditor(closureSnapshot);
    setSelectedClosureSnapshotId(data.data.id);
    setIsClosureSnapshotDialogOpen(false);
  };

  const handleSwitchClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<AllResponse["closures"][0]>>(`/api/restricted/management/closure/${selectedClosure.id}`, {
      method: "PATCH",
      body: { snapshotId },
    });

    if (error) {
      console.error("Failed to switch closure snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    setSelectedClosure(data.data);
    setSelectedClosureId(data.data.id);
    setSelectedClosureSnapshotId(snapshotId);
    setIsSnapshotActing(false);
    setIsClosureSnapshotDialogOpen(false);
    await fetchRoutes();
  };

  return (
    <SidebarProvider>
      <AppSidebar
        mode="route"
        onAddRouteClick={handleShowRoutes}
        onAddClosureRegionClick={handleShowClosureRegion}
      />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <RouteMapComponent
            closures={closures}
            onClosureClick={handleSelectClosure}
            isRoutesLoading={isRoutesLoading}
            onRoutesReadyChange={setAreRouteLayersReady}
            routing={persistedRouting}
            focusedWaypoints={selectedRoute
              ? [...selectedRoute.points.goingTo]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point)
              : undefined}
            focusKey={routeFocusKey}
          />
          <RouteListCard
            mode="route-closures"
            routes={routes}
            regions={[]}
            closures={closures}
            isRoutesLoading={isRoutesLoading}
            selectedRouteId={selectedRoute?.id ?? null}
            selectedRegionId={null}
            selectedClosureId={selectedClosureId}
            onRouteSelect={handleSelectRoute}
            onClosureSelect={handleSelectClosure}
            onManageSnapshots={handleManageSnapshots}
            manageSnapshotsDisabled={!selectedRoute && !selectedClosure}
            selectedItemVersionName={selectedRoute?.snapshotName ?? selectedClosure?.versionName ?? null}
            selectedItemSnapshotState={selectedRoute?.snapshotState ?? selectedClosure?.snapshotState ?? null}
            selectedItemModeLabel={selectedModeLabel}
          />

          {isCreating ? (
            <RouteEditor
              editingRoute={editingRoute}
              onSaved={async () => {
                await fetchRoutes();

                if (editingRoute?.id && editingRoute?.activeSnapshotId) {
                  const refreshedSnapshot = await fetchRouteSnapshot(editingRoute.id, editingRoute.activeSnapshotId);
                  if (refreshedSnapshot) {
                    setSelectedRoute(refreshedSnapshot);
                  }
                }
              }}
              onClosed={() => setEditingRoute(null)}
            />
          ) : null}
          <ClosureRegionEditor onSaved={async () => {
            await fetchRoutes();

            if (selectedClosure?.id && selectedClosure?.activeSnapshotId) {
              const refreshedSnapshot = await fetchClosureSnapshot(selectedClosure.id, selectedClosure.activeSnapshotId);
              if (refreshedSnapshot) {
                setSelectedClosure(refreshedSnapshot);
                setSelectedClosureId(refreshedSnapshot.id);
              }
            }
          }} />
          <SnapshotManagerDialog
            open={isRouteSnapshotDialogOpen}
            title="Route Snapshots"
            description="Select a route snapshot to view, edit, clone, or switch as active."
            snapshots={routeSnapshots}
            selectedSnapshotId={selectedRouteSnapshotId}
            isLoading={isSnapshotLoading}
            isActing={isSnapshotActing}
            onOpenChange={setIsRouteSnapshotDialogOpen}
            onSelectSnapshot={setSelectedRouteSnapshotId}
            onViewSnapshot={handleViewRouteSnapshot}
            onEditSnapshot={handleEditRouteSnapshot}
            onCloneSnapshot={handleCloneRouteSnapshot}
            onSwitchActiveSnapshot={handleSwitchRouteSnapshot}
          />
          <SnapshotManagerDialog
            open={isClosureSnapshotDialogOpen}
            title="Closure Snapshots"
            description="Select a closure snapshot to view, edit, clone, or switch as active."
            snapshots={closureSnapshots}
            selectedSnapshotId={selectedClosureSnapshotId}
            isLoading={isSnapshotLoading}
            isActing={isSnapshotActing}
            onOpenChange={setIsClosureSnapshotDialogOpen}
            onSelectSnapshot={setSelectedClosureSnapshotId}
            onViewSnapshot={handleViewClosureSnapshot}
            onEditSnapshot={handleEditClosureSnapshot}
            onCloneSnapshot={handleCloneClosureSnapshot}
            onSwitchActiveSnapshot={handleSwitchClosureSnapshot}
          />
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
