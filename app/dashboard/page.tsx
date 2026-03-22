"use client";

import { useEffect, useMemo, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import MapComponent from "@/components/map-component";
import RegionEditor from "@/components/region-editor";
import RouteListCard from "@/components/route-list-card";
import RouteEditor from "@/components/route-editor";
import Simulator from "@/components/simulator";
import ClosureRegionEditor from "@/components/closure-region-editor";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";
import { RegionEditorProvider, useRegionEditor } from "@/contexts/RegionEditorContext";
import { RouteEditorProvider, useRouteEditor } from "@/contexts/RouteEditorContext";
import { ClosureEditorProvider, useClosureEditor } from "@/contexts/ClosureEditorContext";

function DashboardContent() {
  const [showSimulator, setShowSimulator] = useState(false);
  const [isFetchingRoutes, setIsFetchingRoutes] = useState(true);
  const [areRouteLayersReady, setAreRouteLayersReady] = useState(false);
  const [routes, setRoutes] = useState<AllResponse["routes"]>([]);
  const [regions, setRegions] = useState<AllResponse["regions"]>([]);
  const [editingRoute, setEditingRoute] = useState<AllResponse["routes"][0] | null>(null);
  const [closures, setClosures] = useState<AllResponse["closures"]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);
  const [routeFocusKey, setRouteFocusKey] = useState<string | number | null>(null);
  const [focusedRegionWaypoints, setFocusedRegionWaypoints] = useState<Array<[number, number]> | undefined>(undefined);
  const [regionFocusKey, setRegionFocusKey] = useState<string | number | null>(null);
  const { isCreating, startCreating, startEditing, stopCreating } = useRouteEditor();
  const {
    showRegionEditor,
    mutationVersion,
    openRegionEditor,
    openRegionEditorForEdit,
    closeRegionEditor,
  } = useRegionEditor();
  const {
    startCreating: startCreatingClosure,
    startEditing: startEditingClosure,
    stopEditing: stopClosureEditing,
  } = useClosureEditor();

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

  const fetchRoutes = async () => {
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

    setRoutes(data.data.routes);
    setRegions(data.data.regions);
    setClosures(data.data.closures ?? []);
    setIsFetchingRoutes(false);
  };

  const isRoutesLoading = isFetchingRoutes || !areRouteLayersReady;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchRoutes();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    if (mutationVersion === 0) return;

    const timerId = window.setTimeout(() => {
      void fetchRoutes();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [mutationVersion]);

  const handleShowRoutes = () => {
    stopClosureEditing();
    if (isCreating) {
      stopCreating();
      setEditingRoute(null);
      setRouteFocusKey(null);
    } else {
      closeRegionEditor();
      setEditingRoute(null);
      startCreating();
    }
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setSelectedRegionId(null);
    setSelectedClosureId(null);
    setShowSimulator(false);
  };

  const handleShowRegions = () => {
    stopClosureEditing();
    if (showRegionEditor) {
      closeRegionEditor();
    } else {
      openRegionEditor();
      if (isCreating) {
        stopCreating();
      }
      setEditingRoute(null);
      setRouteFocusKey(null);
    }

    setSelectedRegionId(null);
    setSelectedClosureId(null);
    setShowSimulator(false);
  };

  const handleShowClosureRegion = () => {
    if (isCreating) {
      stopCreating();
      setEditingRoute(null);
      setRouteFocusKey(null);
    }

    if (showRegionEditor) {
      closeRegionEditor();
    }

    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setSelectedRegionId(null);
    setSelectedClosureId(null);
    setShowSimulator(false);
    startCreatingClosure();
  };

  const handleOpenClosureForEdit = (closure: AllResponse["closures"][0]) => {
    setShowSimulator(false);
    closeRegionEditor();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setSelectedRegionId(null);
    setRouteFocusKey(null);
    setEditingRoute(null);
    stopCreating();

    setSelectedClosureId(closure.id);
    startEditingClosure(closure);
  };

  const handleOpenRegionForEdit = (region: AllResponse["regions"][0]) => {
    setShowSimulator(false);
    setEditingRoute(null);
    setRouteFocusKey(null);
    if (isCreating) {
      stopCreating();
    }
    stopClosureEditing();
    setSelectedClosureId(null);

    const sortedRegionPoints = [...region.points]
      .sort((a, b) => a.sequence - b.sequence)
      .map((point) => point.point);
    setFocusedRegionWaypoints(sortedRegionPoints);
    setRegionFocusKey(`${region.id}-${Date.now()}`);
    setSelectedRegionId(region.id);

    openRegionEditorForEdit({
      id: region.id,
      regionName: region.regionName,
      regionColor: region.regionColor,
      regionShape: region.regionShape,
      points: region.points,
      stations: region.stations,
    });
  };

  const handleOpenRouteForEdit = (route: AllResponse["routes"][0]) => {
    setShowSimulator(false);
    closeRegionEditor();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setSelectedRegionId(null);
    stopClosureEditing();
    setSelectedClosureId(null);
    setRouteFocusKey(`${route.id}-${Date.now()}`);
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

  return (
    <SidebarProvider>
      <AppSidebar
        onAddRouteClick={handleShowRoutes}
        onAddRegionClick={handleShowRegions}
        onAddClosureRegionClick={handleShowClosureRegion}
      />
      <SidebarInset>
        <div className="relative z-0 flex flex-1 flex-col gap-4 overflow-hidden mt-4 p-4 pt-0">
          <MapComponent
            regions={regions}
            closures={closures}
            onClosureClick={handleOpenClosureForEdit}
            isRoutesLoading={isRoutesLoading}
            onRoutesReadyChange={setAreRouteLayersReady}
            routing={persistedRouting}
            focusedWaypoints={editingRoute
              ? [...editingRoute.points.goingTo]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point)
              : undefined}
            focusKey={routeFocusKey}
            focusedRegionWaypoints={focusedRegionWaypoints}
            regionFocusKey={regionFocusKey}
          />
          <RouteListCard
            routes={routes}
            regions={regions}
            closures={closures}
            isRoutesLoading={isRoutesLoading}
            selectedRouteId={editingRoute?.id ?? null}
            selectedRegionId={selectedRegionId}
            selectedClosureId={selectedClosureId}
            onRouteSelect={handleOpenRouteForEdit}
            onRegionSelect={handleOpenRegionForEdit}
            onClosureSelect={handleOpenClosureForEdit}
          />
          {showSimulator && <Simulator />}
          {isCreating && (
            <RouteEditor
              editingRoute={editingRoute}
              onSaved={fetchRoutes}
              onClosed={() => setEditingRoute(null)}
            />
          )}
          {!isCreating && showRegionEditor && (
            <RegionEditor />
          )}
          <ClosureRegionEditor onSaved={fetchRoutes} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function DashboardClient() {
  return (
    <RouteEditorProvider>
      <RegionEditorProvider>
        <ClosureEditorProvider>
          <DashboardContent />
        </ClosureEditorProvider>
      </RegionEditorProvider>
    </RouteEditorProvider>
  );
}
