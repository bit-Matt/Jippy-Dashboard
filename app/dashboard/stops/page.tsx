"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { getErrorMessage } from "@/contracts/parsers";
import type { RouteListItemResponseList, StopResponse, StopResponseList } from "@/contracts/responses";
import { AppSidebar } from "@/components/app-sidebar";
import StopEditor, { type StopDraftSubmitPayload } from "@/components/stop-editor";
import StopItemSidebar from "@/components/stop-item-sidebar";
import StopListCard from "@/components/stop-list-card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { StopDashboardProvider, useStopDashboard } from "@/contexts/StopDashboardContext";
import type { IApiResponse } from "@/lib/http/ApiResponseBuilder";
import { $fetch } from "@/lib/http/client";

import StopMapComponent from "./MapComponent";

interface VehicleTypeOption {
  id: string;
  name: string;
  requiresRoute: boolean;
}

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
  const [stops, setStops] = useState<StopResponseList>([]);
  const [routeOptions, setRouteOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [vehicleTypeOptions, setVehicleTypeOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [isFetchingStops, setIsFetchingStops] = useState(true);
  const [isSavingStop, setIsSavingStop] = useState(false);
  const [isDeletingStop, setIsDeletingStop] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const {
    panelMode,
    selectedStop,
    selectedStopId,
    editorMode,
    focusWaypoints,
    focusKey,
    selectStop,
    clearSelection,
    openCreateEditor,
    openEditEditor,
    syncSelectedStop,
    setSelectedStopPublicState,
  } = useStopDashboard();

  const selectedStopIdRef = useRef<string | null>(null);

  const { data: me } = useSWR<MeResponse>("/api/me", $fetch);
  const userRole = me?.data?.data?.role ?? null;

  const routeNameLookup = useMemo(() => {
    return routeOptions.reduce<Record<string, string>>((lookup, route) => {
      lookup[route.id] = route.label;
      return lookup;
    }, {});
  }, [routeOptions]);

  const vehicleTypeNameLookup = useMemo(() => {
    return vehicleTypeOptions.reduce<Record<string, string>>((lookup, vehicleType) => {
      lookup[vehicleType.id] = vehicleType.label;
      return lookup;
    }, {});
  }, [vehicleTypeOptions]);

  const mapStops = useMemo(() => {
    if (selectedStop) {
      return [selectedStop];
    }

    return stops;
  }, [selectedStop, stops]);

  const fetchStops = useCallback(async () => {
    setIsFetchingStops(true);

    const { data, error } = await $fetch<IApiResponse<StopResponseList>>("/api/restricted/management/stops", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch stops:", error);
      setIsFetchingStops(false);
      return;
    }

    const nextStops = data.data;
    setStops(nextStops);

    if (selectedStopIdRef.current) {
      const refreshedStop = nextStops.find((stop) => stop.id === selectedStopIdRef.current) ?? null;
      syncSelectedStop(refreshedStop);
    }

    setIsFetchingStops(false);
  }, [syncSelectedStop]);

  const fetchRouteLookup = useCallback(async () => {
    const { data, error } = await $fetch<IApiResponse<RouteLookupResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch route lookup:", error);
      return;
    }

    const mappedOptions = data.data.routes.map((route) => ({
      id: route.id,
      label: `${route.routeNumber} - ${route.routeName}`,
    }));

    setRouteOptions(mappedOptions);
  }, []);

  const fetchVehicleTypeLookup = useCallback(async () => {
    const { data, error } = await $fetch<IApiResponse<VehicleTypeOption[]>>("/api/restricted/management/vehicle", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch vehicle type lookup:", error);
      return;
    }

    const mappedOptions = data.data.map((vehicleType) => ({
      id: vehicleType.id,
      label: vehicleType.name,
    }));

    setVehicleTypeOptions(mappedOptions);
  }, []);

  useEffect(() => {
    selectedStopIdRef.current = selectedStopId;
  }, [selectedStopId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void Promise.all([
        fetchStops(),
        fetchRouteLookup(),
        fetchVehicleTypeLookup(),
      ]);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchStops, fetchRouteLookup, fetchVehicleTypeLookup]);

  const handleSelectStop = (stopId: string) => {
    const stop = stops.find((item) => item.id === stopId);
    if (!stop) {
      return;
    }

    selectStop(stop);
  };

  const handleSaveStop = async (payload: StopDraftSubmitPayload) => {
    setIsSavingStop(true);

    try {
      if (editorMode === "creating") {
        const { data, error } = await $fetch<IApiResponse<StopResponse>>("/api/restricted/management/stops", {
          method: "POST",
          body: {
            name: payload.name,
            restrictionType: payload.restrictionType,
            points: payload.points,
            routeIds: payload.routeIds,
            vehicleTypeIds: payload.vehicleTypeIds,
          },
        });

        if (error) {
          alert(getErrorMessage(error, "Failed to create stop."));
          return;
        }

        await fetchStops();
        selectStop(data.data);
        return;
      }

      if (!selectedStopId) {
        alert("Missing stop ID. Please reopen the editor and try again.");
        return;
      }

      const { data, error } = await $fetch<IApiResponse<StopResponse>>(`/api/restricted/management/stops/${selectedStopId}`, {
        method: "PATCH",
        body: {
          name: payload.name,
          restrictionType: payload.restrictionType,
          points: payload.points,
          routeIds: payload.routeIds,
          vehicleTypeIds: payload.vehicleTypeIds,
        },
      });

      if (error) {
        alert(getErrorMessage(error, "Failed to update stop."));
        return;
      }

      await fetchStops();
      selectStop(data.data);
    } finally {
      setIsSavingStop(false);
    }
  };

  const handleDeleteStop = async () => {
    if (!selectedStop || isDeletingStop) {
      return;
    }

    const shouldDelete = window.confirm("Delete this stop? This action cannot be undone.");
    if (!shouldDelete) {
      return;
    }

    setIsDeletingStop(true);

    const { error } = await $fetch(`/api/restricted/management/stops/${selectedStop.id}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete stop:", error);
      alert(getErrorMessage(error, "Failed to delete stop."));
      setIsDeletingStop(false);
      return;
    }

    clearSelection();
    await fetchStops();
    setIsDeletingStop(false);
  };

  const handleTogglePublic = async (nextState: boolean) => {
    if (!selectedStop || isPublishing) {
      return;
    }

    setIsPublishing(true);

    const { error } = await $fetch<IApiResponse<{ id: string; isPublic: boolean }>>(
      `/api/restricted/management/stops/${selectedStop.id}/publishing`,
      {
        method: "PATCH",
        body: { isPublic: nextState },
      },
    );

    if (error) {
      console.error("Failed to toggle stop publication:", error);
      alert(getErrorMessage(error, "Failed to toggle stop publication."));
      setIsPublishing(false);
      return;
    }

    setSelectedStopPublicState(nextState);
    await fetchStops();
    setIsPublishing(false);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <StopMapComponent
            stops={mapStops}
            onStopClick={(stop) => selectStop(stop)}
            focusedWaypoints={focusWaypoints}
            focusKey={focusKey}
          />

          <StopListCard
            stops={stops}
            isLoading={isFetchingStops}
            selectedStopId={selectedStopId}
            onSelectStop={handleSelectStop}
            onCreateStop={openCreateEditor}
          />

          {panelMode === "details" && selectedStop ? (
            <div className="absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 translate-x-0 opacity-100">
              <StopItemSidebar
                stop={selectedStop}
                userRole={userRole}
                routeNameLookup={routeNameLookup}
                vehicleTypeNameLookup={vehicleTypeNameLookup}
                isPublishing={isPublishing}
                isDeletingStop={isDeletingStop}
                onClose={clearSelection}
                onEditStop={() => openEditEditor(selectedStop)}
                onDeleteStop={handleDeleteStop}
                onTogglePublic={handleTogglePublic}
              />
            </div>
          ) : null}

          {panelMode === "editor" ? (
            <StopEditor
              routeOptions={routeOptions}
              vehicleTypeOptions={vehicleTypeOptions}
              isSaving={isSavingStop}
              onSave={handleSaveStop}
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
