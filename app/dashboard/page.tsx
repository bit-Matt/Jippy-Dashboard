"use client";

import { useEffect, useState } from "react";

import { AppSidebar, type RouteSummary } from "@/components/app-sidebar";
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
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [editingRoute, setEditingRoute] = useState<RouteSummary | null>(null);
  const { isCreating, startCreating, startEditing, stopCreating } = useRouteEditor();
  const { showRegionEditor, openRegionEditor, closeRegionEditor } = useRegionEditor();

  const fetchRoutes = async () => {
    const { data, error } = await $fetch<IApiResponse<RouteSummary[]>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch routes:", error);
      return;
    }

    console.log(data.data);
    setRoutes(data.data);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchRoutes();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  const handleShowRoutes = () => {
    if (isCreating) {
      stopCreating();
      setEditingRoute(null);
    } else {
      closeRegionEditor();
      setEditingRoute(null);
      startCreating();
    }
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
    }

    setShowSimulator(false);
  };

  const handleOpenRouteForEdit = (route: RouteSummary) => {
    setShowSimulator(false);
    closeRegionEditor();
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
        onRouteClick={handleOpenRouteForEdit}
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
            focusKey={editingRoute?.id ?? null}
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
