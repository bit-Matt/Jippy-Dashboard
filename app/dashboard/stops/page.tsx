"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { getErrorMessage } from "@/contracts/parsers";
import type {
  RestrictedBoardingZoneResponse,
  RestrictedBoardingZoneResponseList,
  RouteListItemResponseList,
  StopResponse,
  StopResponseList,
} from "@/contracts/responses";
import { AppSidebar } from "@/components/app-sidebar";
import RouteOverlayPanel from "@/components/route-overlay-panel";
import StopEditor, { type StopDraftSubmitPayload } from "@/components/stop-editor";
import StopItemSidebar from "@/components/stop-item-sidebar";
import StopListCard from "@/components/stop-list-card";
import TransitStopDraftSidebar from "@/components/transit-stop-draft-sidebar";
import TransitStopItemSidebar from "@/components/transit-stop-item-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { StopDashboardProvider, useStopDashboard } from "@/contexts/StopDashboardContext";
import type { IApiResponse } from "@/lib/http/ApiResponseBuilder";
import { $fetch } from "@/lib/http/client";

import StopMapComponent from "./MapComponent";

interface MeResponse {
  data: {
    ok: boolean;
    data: {
      role: string;
    };
  };
  error?: unknown;
}

interface RouteLookupResponse {
  routes: RouteListItemResponseList;
}

function StopsDashboardContent() {
  const [transitStops, setTransitStops] = useState<StopResponseList>([]);
  const [rbzList, setRbzList] = useState<RestrictedBoardingZoneResponseList>([]);
  const [routeOptions, setRouteOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [overlayRoutes, setOverlayRoutes] = useState<RouteListItemResponseList>([]);
  const [isFetchingTransitStops, setIsFetchingTransitStops] = useState(true);
  const [isFetchingRbz, setIsFetchingRbz] = useState(true);
  const [isSavingRbz, setIsSavingRbz] = useState(false);
  const [isSavingTransitStop, setIsSavingTransitStop] = useState(false);
  const [isDeletingTransitStop, setIsDeletingTransitStop] = useState(false);
  const [isDeletingRbz, setIsDeletingRbz] = useState(false);
  const [isPublishingTransitStop, setIsPublishingTransitStop] = useState(false);
  const [isPublishingRbz, setIsPublishingRbz] = useState(false);

  const {
    activeTab,
    routeOverlayEnabled,
    selectedOverlayRouteIds,
    selectedTransitStop,
    selectedTransitStopId,
    transitStopCreateMode,
    pendingCreatePoint,
    transitStopEditingPoint,
    panelMode,
    selectedRbz,
    selectedRbzId,
    rbzEditorMode,
    focusWaypoints,
    focusKey,
    setActiveTab,
    setRouteOverlayEnabled,
    toggleOverlayRouteId,
    selectTransitStopFromList,
    selectTransitStopFromMap,
    clearTransitStopSelection,
    openTransitStopCreateMode,
    cancelTransitStopCreateMode,
    setPendingCreatePoint,
    setTransitStopEditingPoint,
    syncSelectedTransitStop,
    setSelectedTransitStopPublicState,
    selectRbz,
    clearRbzSelection,
    openCreateRbzEditor,
    openEditRbzEditor,
    syncSelectedRbz,
    setSelectedRbzPublicState,
  } = useStopDashboard();

  const selectedTransitStopIdRef = useRef<string | null>(null);
  const selectedRbzIdRef = useRef<string | null>(null);

  const { data: me } = useSWR<MeResponse>("/api/me", $fetch);
  const userRole = me?.data?.data?.role ?? null;

  const routeNameLookup = useMemo(() => {
    return routeOptions.reduce<Record<string, string>>((lookup, route) => {
      lookup[route.id] = route.label;
      return lookup;
    }, {});
  }, [routeOptions]);

  const fetchTransitStops = useCallback(async () => {
    setIsFetchingTransitStops(true);

    const { data, error } = await $fetch<IApiResponse<StopResponseList>>("/api/restricted/management/stops", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch transit stops:", error);
      setIsFetchingTransitStops(false);
      return;
    }

    const nextStops = data.data;
    setTransitStops(nextStops);

    if (selectedTransitStopIdRef.current) {
      const refreshedStop = nextStops.find((stop) => stop.id === selectedTransitStopIdRef.current) ?? null;
      syncSelectedTransitStop(refreshedStop);
    }

    setIsFetchingTransitStops(false);
  }, [syncSelectedTransitStop]);

  const fetchRbzList = useCallback(async () => {
    setIsFetchingRbz(true);

    const { data, error } = await $fetch<IApiResponse<RestrictedBoardingZoneResponseList>>(
      "/api/restricted/management/restricted-boarding-zone",
      { method: "GET" },
    );

    if (error) {
      console.error("Failed to fetch restricted boarding zones:", error);
      setIsFetchingRbz(false);
      return;
    }

    const nextZones = data.data;
    setRbzList(nextZones);

    if (selectedRbzIdRef.current) {
      const refreshedZone = nextZones.find((zone) => zone.id === selectedRbzIdRef.current) ?? null;
      syncSelectedRbz(refreshedZone);
    }

    setIsFetchingRbz(false);
  }, [syncSelectedRbz]);

  const fetchRouteLookup = useCallback(async () => {
    const { data, error } = await $fetch<IApiResponse<RouteLookupResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch route lookup:", error);
      return;
    }

    const routes = data.data.routes;
    setOverlayRoutes(routes);
    setRouteOptions(routes.map((route) => ({
      id: route.id,
      label: `${route.routeNumber} - ${route.routeName}`,
    })));
  }, []);

  useEffect(() => {
    selectedTransitStopIdRef.current = selectedTransitStopId;
  }, [selectedTransitStopId]);

  useEffect(() => {
    selectedRbzIdRef.current = selectedRbzId;
  }, [selectedRbzId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void Promise.all([
        fetchTransitStops(),
        fetchRbzList(),
        fetchRouteLookup(),
      ]);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchTransitStops, fetchRbzList, fetchRouteLookup]);

  const handleSelectTransitStop = (stopId: string) => {
    const stop = transitStops.find((item) => item.id === stopId);
    if (!stop) {
      return;
    }

    selectTransitStopFromList(stop);
  };

  const handleTransitStopMapClick = (stop: StopResponse) => {
    selectTransitStopFromMap(stop);
  };

  const handleSelectRbz = (zoneId: string) => {
    const zone = rbzList.find((item) => item.id === zoneId);
    if (!zone) {
      return;
    }

    selectRbz(zone);
  };

  const handleMapClick = (point: [number, number]) => {
    if (!transitStopCreateMode) {
      return;
    }

    setPendingCreatePoint(point);
  };

  const handlePendingPointDragEnd = (point: [number, number]) => {
    setPendingCreatePoint(point);
  };

  const handleEditingPointDragEnd = (point: [number, number]) => {
    setTransitStopEditingPoint(point);
  };

  const handleCancelTransitStopDraft = () => {
    setPendingCreatePoint(null);
    cancelTransitStopCreateMode();
  };

  const handleCreateTransitStop = async (payload: {
    point: [number, number];
    number?: number;
    isPublic: boolean;
  }) => {
    setIsSavingTransitStop(true);

    try {
      const { data, error } = await $fetch<IApiResponse<StopResponse>>("/api/restricted/management/stops", {
        method: "POST",
        body: {
          point: payload.point,
          number: payload.number,
        },
      });

      if (error) {
        alert(getErrorMessage(error, "Failed to create stop."));
        return;
      }

      if (payload.isPublic && userRole === "administrator_user") {
        const { error: publishError } = await $fetch<IApiResponse<{ id: string; isPublic: boolean }>>(
          `/api/restricted/management/stops/${data.data.id}/publishing`,
          {
            method: "PATCH",
            body: { isPublic: true },
          },
        );

        if (publishError) {
          alert(getErrorMessage(publishError, "Stop created but failed to publish."));
        }
      }

      setPendingCreatePoint(null);
      cancelTransitStopCreateMode();
      await fetchTransitStops();

      const refreshedStop = payload.isPublic && userRole === "administrator_user"
        ? { ...data.data, isPublic: true }
        : data.data;

      selectTransitStopFromMap(refreshedStop);
    } finally {
      setIsSavingTransitStop(false);
    }
  };

  const handleUpdateTransitStop = async (payload: {
    point: [number, number];
    number?: number;
    isPublic: boolean;
  }) => {
    if (!selectedTransitStop) {
      return;
    }

    setIsSavingTransitStop(true);

    try {
      const { data, error } = await $fetch<IApiResponse<StopResponse>>(
        `/api/restricted/management/stops/${selectedTransitStop.id}`,
        {
          method: "PATCH",
          body: {
            point: payload.point,
            number: payload.number,
          },
        },
      );

      if (error) {
        alert(getErrorMessage(error, "Failed to update stop."));
        return;
      }

      if (payload.isPublic !== selectedTransitStop.isPublic && userRole === "administrator_user") {
        const { error: publishError } = await $fetch<IApiResponse<{ id: string; isPublic: boolean }>>(
          `/api/restricted/management/stops/${selectedTransitStop.id}/publishing`,
          {
            method: "PATCH",
            body: { isPublic: payload.isPublic },
          },
        );

        if (publishError) {
          alert(getErrorMessage(publishError, "Stop updated but failed to change publication status."));
        }
      }

      await fetchTransitStops();

      const refreshedStop = payload.isPublic && userRole === "administrator_user"
        ? { ...data.data, isPublic: true }
        : data.data;

      selectTransitStopFromMap(refreshedStop);
    } finally {
      setIsSavingTransitStop(false);
    }
  };

  const handleCancelTransitStopEdit = () => {
    clearTransitStopSelection();
  };

  const handleSaveRbz = async (payload: StopDraftSubmitPayload) => {
    setIsSavingRbz(true);

    try {
      if (rbzEditorMode === "creating") {
        const { data, error } = await $fetch<IApiResponse<RestrictedBoardingZoneResponse>>(
          "/api/restricted/management/restricted-boarding-zone",
          {
            method: "POST",
            body: {
              name: payload.name,
              restrictionType: payload.restrictionType,
              disallowedDirection: payload.disallowedDirection,
              points: payload.points,
              routeIds: payload.routeIds,
            },
          },
        );

        if (error) {
          alert(getErrorMessage(error, "Failed to create restricted zone."));
          return;
        }

        await fetchRbzList();
        selectRbz(data.data);
        return;
      }

      if (!selectedRbzId) {
        alert("Missing zone ID. Please reopen the editor and try again.");
        return;
      }

      const { data, error } = await $fetch<IApiResponse<RestrictedBoardingZoneResponse>>(
        `/api/restricted/management/restricted-boarding-zone/${selectedRbzId}`,
        {
          method: "PATCH",
          body: {
            name: payload.name,
            restrictionType: payload.restrictionType,
            disallowedDirection: payload.disallowedDirection,
            points: payload.points,
            routeIds: payload.routeIds,
          },
        },
      );

      if (error) {
        alert(getErrorMessage(error, "Failed to update restricted zone."));
        return;
      }

      await fetchRbzList();
      selectRbz(data.data);
    } finally {
      setIsSavingRbz(false);
    }
  };

  const handleDeleteTransitStop = async () => {
    if (!selectedTransitStop || isDeletingTransitStop) {
      return;
    }

    const shouldDelete = window.confirm("Delete this stop? This action cannot be undone.");
    if (!shouldDelete) {
      return;
    }

    setIsDeletingTransitStop(true);

    const { error } = await $fetch(`/api/restricted/management/stops/${selectedTransitStop.id}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete stop:", error);
      alert(getErrorMessage(error, "Failed to delete stop."));
      setIsDeletingTransitStop(false);
      return;
    }

    clearTransitStopSelection();
    await fetchTransitStops();
    setIsDeletingTransitStop(false);
  };

  const handleDeleteRbz = async () => {
    if (!selectedRbz || isDeletingRbz) {
      return;
    }

    const shouldDelete = window.confirm("Delete this restricted zone? This action cannot be undone.");
    if (!shouldDelete) {
      return;
    }

    setIsDeletingRbz(true);

    const { error } = await $fetch(`/api/restricted/management/restricted-boarding-zone/${selectedRbz.id}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete restricted zone:", error);
      alert(getErrorMessage(error, "Failed to delete restricted zone."));
      setIsDeletingRbz(false);
      return;
    }

    clearRbzSelection();
    await fetchRbzList();
    setIsDeletingRbz(false);
  };

  const handleToggleTransitStopPublic = async (nextState: boolean) => {
    if (!selectedTransitStop || isPublishingTransitStop) {
      return;
    }

    setIsPublishingTransitStop(true);

    const { error } = await $fetch<IApiResponse<{ id: string; isPublic: boolean }>>(
      `/api/restricted/management/stops/${selectedTransitStop.id}/publishing`,
      {
        method: "PATCH",
        body: { isPublic: nextState },
      },
    );

    if (error) {
      console.error("Failed to toggle stop publication:", error);
      alert(getErrorMessage(error, "Failed to toggle stop publication."));
      setIsPublishingTransitStop(false);
      return;
    }

    setSelectedTransitStopPublicState(nextState);
    await fetchTransitStops();
    setIsPublishingTransitStop(false);
  };

  const handleToggleRbzPublic = async (nextState: boolean) => {
    if (!selectedRbz || isPublishingRbz) {
      return;
    }

    setIsPublishingRbz(true);

    const { error } = await $fetch<IApiResponse<{ id: string; isPublic: boolean }>>(
      `/api/restricted/management/restricted-boarding-zone/${selectedRbz.id}/publishing`,
      {
        method: "PATCH",
        body: { isPublic: nextState },
      },
    );

    if (error) {
      console.error("Failed to toggle restricted zone publication:", error);
      alert(getErrorMessage(error, "Failed to toggle restricted zone publication."));
      setIsPublishingRbz(false);
      return;
    }

    setSelectedRbzPublicState(nextState);
    await fetchRbzList();
    setIsPublishingRbz(false);
  };

  const handleToggleRouteOverlay = (enabled: boolean) => {
    setRouteOverlayEnabled(enabled, overlayRoutes.map((route) => route.id));
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <StopMapComponent
            activeTab={activeTab}
            transitStops={transitStops}
            rbzList={rbzList}
            overlayRoutes={overlayRoutes}
            routeOverlayEnabled={routeOverlayEnabled}
            selectedOverlayRouteIds={selectedOverlayRouteIds}
            onTransitStopClick={handleTransitStopMapClick}
            onRbzClick={(zone) => selectRbz(zone)}
            onMapClick={handleMapClick}
            onPendingPointDragEnd={handlePendingPointDragEnd}
            onEditingPointDragEnd={handleEditingPointDragEnd}
            focusedWaypoints={focusWaypoints}
            focusKey={focusKey}
          />

          {activeTab === "stops" && routeOverlayEnabled ? (
            <RouteOverlayPanel
              routes={overlayRoutes}
              selectedRouteIds={selectedOverlayRouteIds}
              onToggleRoute={toggleOverlayRouteId}
            />
          ) : null}

          <StopListCard
            activeTab={activeTab}
            stops={transitStops}
            rbzList={rbzList}
            isLoadingStops={isFetchingTransitStops}
            isLoadingRbz={isFetchingRbz}
            selectedTransitStopId={selectedTransitStopId}
            selectedRbzId={selectedRbzId}
            routeOverlayEnabled={routeOverlayEnabled}
            onTabChange={setActiveTab}
            onSelectStop={handleSelectTransitStop}
            onSelectRbz={handleSelectRbz}
            onCreateStop={openTransitStopCreateMode}
            onCreateRbz={openCreateRbzEditor}
            onToggleRouteOverlay={handleToggleRouteOverlay}
          />

          {activeTab === "stops" && pendingCreatePoint ? (
            <div className="absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 translate-x-0 opacity-100">
              <TransitStopDraftSidebar
                mode="create"
                point={pendingCreatePoint}
                userRole={userRole}
                isSaving={isSavingTransitStop}
                onCancel={handleCancelTransitStopDraft}
                onSave={handleCreateTransitStop}
              />
            </div>
          ) : null}

          {activeTab === "stops" && selectedTransitStop && transitStopEditingPoint && !pendingCreatePoint ? (
            <div className="absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 translate-x-0 opacity-100">
              <TransitStopDraftSidebar
                mode="edit"
                point={transitStopEditingPoint}
                stop={selectedTransitStop}
                userRole={userRole}
                isSaving={isSavingTransitStop}
                isDeletingStop={isDeletingTransitStop}
                onCancel={handleCancelTransitStopEdit}
                onSave={handleUpdateTransitStop}
                onDeleteStop={handleDeleteTransitStop}
              />
            </div>
          ) : null}

          {activeTab === "stops" && selectedTransitStop && selectedTransitStop.isPublic && !pendingCreatePoint ? (
            <div className="absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 translate-x-0 opacity-100">
              <TransitStopItemSidebar
                stop={selectedTransitStop}
                userRole={userRole}
                isPublishing={isPublishingTransitStop}
                isDeletingStop={isDeletingTransitStop}
                onClose={clearTransitStopSelection}
                onDeleteStop={handleDeleteTransitStop}
                onTogglePublic={handleToggleTransitStopPublic}
              />
            </div>
          ) : null}

          {activeTab === "restricted-zones" && panelMode === "details" && selectedRbz ? (
            <div className="absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 translate-x-0 opacity-100">
              <StopItemSidebar
                stop={selectedRbz}
                userRole={userRole}
                routeNameLookup={routeNameLookup}
                isPublishing={isPublishingRbz}
                isDeletingStop={isDeletingRbz}
                onClose={clearRbzSelection}
                onEditStop={() => openEditRbzEditor(selectedRbz)}
                onDeleteStop={handleDeleteRbz}
                onTogglePublic={handleToggleRbzPublic}
              />
            </div>
          ) : null}

          {activeTab === "restricted-zones" && panelMode === "editor" ? (
            <StopEditor
              routeOptions={routeOptions}
              isSaving={isSavingRbz}
              onSave={handleSaveRbz}
            />
          ) : null}

        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function StopsDashboardPage() {
  return (
    <StopDashboardProvider>
      <StopsDashboardContent />
    </StopDashboardProvider>
  );
}
