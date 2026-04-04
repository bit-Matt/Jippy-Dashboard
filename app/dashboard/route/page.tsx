"use client";

import { useEffect, useMemo, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import ClosureRegionEditor from "@/components/closure-region-editor";
import RouteEditor from "@/components/route-editor";
import RouteListCard from "@/components/route-list-card";
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
  const [editingRoute, setEditingRoute] = useState<AllResponse["routes"][0] | null>(null);
  const [closures, setClosures] = useState<AllResponse["closures"]>([]);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);
  const [routeFocusKey, setRouteFocusKey] = useState<string | number | null>(null);

  const { isCreating, startCreating, startEditing, stopCreating } = useRouteEditor();
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

  const handleShowRoutes = () => {
    stopClosureEditing();
    setSelectedClosureId(null);

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
    startCreatingClosure();
  };

  const handleOpenClosureForEdit = (closure: AllResponse["closures"][0]) => {
    setRouteFocusKey(null);
    setEditingRoute(null);
    stopCreating();

    setSelectedClosureId(closure.id);
    startEditingClosure(closure);
  };

  const handleOpenRouteForEdit = (route: AllResponse["routes"][0]) => {
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
        mode="route"
        onAddRouteClick={handleShowRoutes}
        onAddClosureRegionClick={handleShowClosureRegion}
      />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <RouteMapComponent
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
          />
          <RouteListCard
            mode="route-closures"
            routes={routes}
            regions={[]}
            closures={closures}
            isRoutesLoading={isRoutesLoading}
            selectedRouteId={editingRoute?.id ?? null}
            selectedRegionId={null}
            selectedClosureId={selectedClosureId}
            onRouteSelect={handleOpenRouteForEdit}
            onClosureSelect={handleOpenClosureForEdit}
          />

          {isCreating ? (
            <RouteEditor
              editingRoute={editingRoute}
              onSaved={fetchRoutes}
              onClosed={() => setEditingRoute(null)}
            />
          ) : null}
          <ClosureRegionEditor onSaved={fetchRoutes} />
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
