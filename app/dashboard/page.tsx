"use client";

import { useEffect, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import MapComponent from "@/components/map-component";
import RegionEditor from "@/components/region-editor";
import RouteEditor from "@/components/route-editor";
import { Separator } from "@/components/ui/separator";
import Simulator from "@/components/simulator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";
import { RegionEditorProvider, useRegionEditor } from "@/contexts/RegionEditorContext";
import { RouteEditorProvider, useRouteEditor } from "@/contexts/RouteEditorContext";

function DashboardContent() {
  const [showSimulator, setShowSimulator] = useState(false);
  const [routes, setRoutes] = useState<AllResponse["routes"]>([]);
  const [regions, setRegions] = useState<AllResponse["regions"]>([]);
  const [editingRoute, setEditingRoute] = useState<AllResponse["routes"][0] | null>(null);
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

  const fetchRoutes = async () => {
    const { data, error } = await $fetch<IApiResponse<AllResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch routes:", error);
      return;
    }

    console.log(data.data);
    setRoutes(data.data.routes);
    setRegions(data.data.regions);
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
    setShowSimulator(false);
  };

  const handleShowRegions = () => {
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

    setShowSimulator(false);
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
    setRouteFocusKey(`${route.id}-${Date.now()}`);
    setEditingRoute(route);

    const sortedPoints = [...route.points].sort((a, b) => a.sequence - b.sequence);
    startEditing({
      color: route.routeColor,
      points: sortedPoints.map((point) => ({ point: point.point })),
    });
  };

  const handleShowSimulator = () => {
    setShowSimulator(!showSimulator);
    closeRegionEditor();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setRouteFocusKey(null);
    setEditingRoute(null);
    stopCreating();
  };

  return (
    <SidebarProvider>
      <AppSidebar
        onAddRouteClick={handleShowRoutes}
        onAddRegionClick={handleShowRegions}
        onSimulationClick={handleShowSimulator}
        routes={routes}
        regions={regions}
        onRouteClick={handleOpenRouteForEdit}
        onRegionClick={handleOpenRegionForEdit}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Jippy Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Route Editor</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="relative z-0 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <MapComponent
            regions={regions}
            routing={routes.map((route) => ({
              color: route.routeColor,
              waypoints: [...route.points]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point),
            }))}
            focusedWaypoints={editingRoute
              ? [...editingRoute.points]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point)
              : undefined}
            focusKey={routeFocusKey}
            focusedRegionWaypoints={focusedRegionWaypoints}
            regionFocusKey={regionFocusKey}
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function DashboardClient() {
  return (
    <RouteEditorProvider>
      <RegionEditorProvider>
        <DashboardContent />
      </RegionEditorProvider>
    </RouteEditorProvider>
  );
}
