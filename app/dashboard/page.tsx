"use client";

import { useEffect, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import MapComponent from "@/components/map-component";
import RegionEditor from "@/components/region-editor";
import RouteListCard from "@/components/route-list-card";
import RouteEditor from "@/components/route-editor";
import Simulator from "@/components/simulator";
import ClosureLineEditor from "@/components/closure-line-editor";
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
  const [routes, setRoutes] = useState<AllResponse["routes"]>([]);
  const [regions, setRegions] = useState<AllResponse["regions"]>([]);
  const [editingRoute, setEditingRoute] = useState<AllResponse["routes"][0] | null>(null);
  const [closureLines, setClosureLines] = useState<AllResponse["closures"]["lineClosures"]>([]);
  const [closureRegions, setClosureRegions] = useState<AllResponse["closures"]["regionClosures"]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
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
    mode: closureMode,
    startCreatingLine,
    startCreatingRegion,
    stopEditing: stopClosureEditing,
  } = useClosureEditor();

  const fetchRoutes = async () => {
    const { data, error } = await $fetch<IApiResponse<AllResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch routes:", error);
      return;
    }

    setRoutes(data.data.routes);
    setRegions(data.data.regions);
    setClosureLines(data.data.closures.lineClosures);
    setClosureRegions(data.data.closures.regionClosures);
  };

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
    setShowSimulator(false);
  };

  const handleShowClosureLine = () => {
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
    setShowSimulator(false);
    startCreatingLine();
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
    setShowSimulator(false);
    startCreatingRegion();
  };

  const handleOpenRegionForEdit = (region: AllResponse["regions"][0]) => {
    setShowSimulator(false);
    setEditingRoute(null);
    setRouteFocusKey(null);
    if (isCreating) {
      stopCreating();
    }

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
    setRouteFocusKey(`${route.id}-${Date.now()}`);
    setEditingRoute(route);

    startEditing({
      color: route.routeColor,
      points: {
        goingTo: [...route.points.goingTo]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => ({ point: point.point })),
        goingBack: [...route.points.goingBack]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => ({ point: point.point })),
      },
    });
  };

  const handleShowSimulator = () => {
    setShowSimulator(!showSimulator);
    closeRegionEditor();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setSelectedRegionId(null);
    setRouteFocusKey(null);
    setEditingRoute(null);
    stopCreating();
    stopClosureEditing();
  };

  return (
    <SidebarProvider>
      <AppSidebar
        onAddRouteClick={handleShowRoutes}
        onAddRegionClick={handleShowRegions}
        onSimulationClick={handleShowSimulator}
        onAddClosureLineClick={handleShowClosureLine}
        onAddClosureRegionClick={handleShowClosureRegion}
      />
      <SidebarInset>
        <div className="relative z-0 flex flex-1 flex-col gap-4 overflow-hidden mt-4 p-4 pt-0">
          <MapComponent
            regions={regions}
            closureLines={closureLines}
            closureRegions={closureRegions}
            routing={routes.flatMap((route) => {
              const goingToWaypoints = [...route.points.goingTo]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point);

              const goingBackWaypoints = [...route.points.goingBack]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point);

              return [
                {
                  color: route.routeColor,
                  waypoints: goingToWaypoints,
                },
                {
                  color: route.routeColor,
                  waypoints: goingBackWaypoints,
                },
              ].filter((entry) => entry.waypoints.length >= 2);
            })}
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
            selectedRouteId={editingRoute?.id ?? null}
            selectedRegionId={selectedRegionId}
            onRouteSelect={handleOpenRouteForEdit}
            onRegionSelect={handleOpenRegionForEdit}
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
          <ClosureLineEditor onSaved={fetchRoutes} />
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
