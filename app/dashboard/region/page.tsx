"use client";

import { useEffect, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import RegionEditor from "@/components/region-editor";
import RouteListCard from "@/components/route-list-card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { RegionEditorProvider, useRegionEditor } from "@/contexts/RegionEditorContext";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";

import RegionMapComponent from "./MapComponent";

function RegionDashboardContent() {
  const [isFetchingRegions, setIsFetchingRegions] = useState(true);
  const [regions, setRegions] = useState<AllResponse["regions"]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [focusedRegionWaypoints, setFocusedRegionWaypoints] = useState<Array<[number, number]> | undefined>(undefined);
  const [regionFocusKey, setRegionFocusKey] = useState<string | number | null>(null);

  const {
    showRegionEditor,
    mutationVersion,
    openRegionEditor,
    openRegionEditorForEdit,
    closeRegionEditor,
  } = useRegionEditor();

  const fetchRegions = async () => {
    setIsFetchingRegions(true);

    const { data, error } = await $fetch<IApiResponse<AllResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch regions:", error);
      setIsFetchingRegions(false);
      return;
    }

    setRegions(data.data.regions);
    setIsFetchingRegions(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchRegions();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    if (mutationVersion === 0) return;

    const timerId = window.setTimeout(() => {
      void fetchRegions();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [mutationVersion]);

  const handleShowRegions = () => {
    if (showRegionEditor) {
      closeRegionEditor();
      setFocusedRegionWaypoints(undefined);
      setRegionFocusKey(null);
      setSelectedRegionId(null);
      return;
    }

    openRegionEditor();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setSelectedRegionId(null);
  };

  const handleOpenRegionForEdit = (region: AllResponse["regions"][0]) => {
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

  return (
    <SidebarProvider>
      <AppSidebar
        mode="region"
        onAddRegionClick={handleShowRegions}
      />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <RegionMapComponent
            regions={regions}
            focusedRegionWaypoints={focusedRegionWaypoints}
            regionFocusKey={regionFocusKey}
          />
          <RouteListCard
            mode="regions"
            routes={[]}
            regions={regions}
            closures={[]}
            isRoutesLoading={isFetchingRegions}
            selectedRouteId={null}
            selectedRegionId={selectedRegionId}
            selectedClosureId={null}
            onRegionSelect={handleOpenRegionForEdit}
          />
          {showRegionEditor ? <RegionEditor /> : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function RegionDashboardPage() {
  return (
    <RegionEditorProvider>
      <RegionDashboardContent />
    </RegionEditorProvider>
  );
}
