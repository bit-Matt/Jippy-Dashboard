"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import RegionItemSidebar from "@/components/region-item-sidebar";
import RegionEditor from "@/components/region-editor";
import RouteListCard from "@/components/route-list-card";
import type { RegionResponse, RegionResponseList } from "@/contracts/responses";
import { type SnapshotListItem } from "@/components/snapshot-types";
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
  const [regions, setRegions] = useState<RegionResponseList>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionResponse | null>(null);
  const selectedRegionRef = useRef<RegionResponse | null>(null);
  const selectedRegionIdRef = useRef<string | null>(null);

  const [focusedRegionWaypoints, setFocusedRegionWaypoints] = useState<Array<[number, number]> | undefined>(undefined);
  const [regionFocusKey, setRegionFocusKey] = useState<string | number | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotActing, setIsSnapshotActing] = useState(false);
  const [isDeletingRegion, setIsDeletingRegion] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [activeRegionSnapshotId, setActiveRegionSnapshotId] = useState<string | null>(null);

  const {
    showRegionEditor,
    mutationVersion,
    openRegionEditor,
    openRegionSnapshotEditor,
    openRegionEditorForEdit,
    closeRegionEditor,
  } = useRegionEditor();

  const resetSnapshotState = useCallback(() => {
    setSnapshots([]);
    setSelectedSnapshotId(null);
    setActiveRegionSnapshotId(null);
  }, []);

  const mapRegions = useMemo(() => {
    if (!selectedRegion) {
      return regions;
    }

    return [selectedRegion];
  }, [regions, selectedRegion]);

  useEffect(() => {
    selectedRegionRef.current = selectedRegion;
  }, [selectedRegion]);

  useEffect(() => {
    selectedRegionIdRef.current = selectedRegionId;
  }, [selectedRegionId]);

  const loadSnapshots = useCallback(async (regionId: string, activeSnapshotId: string) => {
    setIsSnapshotLoading(true);

    const { data, error } = await $fetch<IApiResponse<SnapshotListItem[]>>(`/api/restricted/management/region/${regionId}/snapshots`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load region snapshots:", error);
      setIsSnapshotLoading(false);
      return;
    }

    setSnapshots(data.data);
    setActiveRegionSnapshotId(activeSnapshotId);
    setSelectedSnapshotId((prev) => prev ?? activeSnapshotId);
    setIsSnapshotLoading(false);
  }, []);

  const fetchRegions = useCallback(async () => {
    setIsFetchingRegions(true);

    const { data, error } = await $fetch<IApiResponse<RegionResponseList>>("/api/restricted/management/region", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch regions:", error);
      setIsFetchingRegions(false);
      return;
    }

    const nextRegions = data.data;
    setRegions(nextRegions);

    const currentSelectedRegion = selectedRegionRef.current;
    const currentSelectedRegionId = selectedRegionIdRef.current;

    if (!currentSelectedRegion) {
      if (currentSelectedRegionId && !nextRegions.some((region) => region.id === currentSelectedRegionId)) {
        setSelectedRegionId(null);
      }
    } else {
      const refreshedRegion = nextRegions.find((region) => region.id === currentSelectedRegion.id) ?? null;
      if (!refreshedRegion) {
        setSelectedRegion(null);
        setSelectedRegionId(null);
        resetSnapshotState();
      } else {
        setSelectedRegion(refreshedRegion);
        setActiveRegionSnapshotId(refreshedRegion.activeSnapshotId);
        void loadSnapshots(refreshedRegion.id, refreshedRegion.activeSnapshotId);
      }
    }

    setIsFetchingRegions(false);
  }, [loadSnapshots, resetSnapshotState]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchRegions();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchRegions]);

  useEffect(() => {
    if (mutationVersion === 0) return;

    const timerId = window.setTimeout(() => {
      void fetchRegions();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [mutationVersion, fetchRegions]);

  const handleShowRegions = () => {
    if (showRegionEditor) {
      closeRegionEditor();
      setFocusedRegionWaypoints(undefined);
      setRegionFocusKey(null);
      setSelectedRegionId(null);
      setSelectedRegion(null);
      resetSnapshotState();
      return;
    }

    openRegionEditor();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    setSelectedRegionId(null);
    setSelectedRegion(null);
    resetSnapshotState();
  };

  const handleOpenRegionForEdit = (region: RegionResponse) => {
    const sortedRegionPoints = [...region.points]
      .sort((a, b) => a.sequence - b.sequence)
      .map((point) => point.point);

    setFocusedRegionWaypoints(sortedRegionPoints);
    setRegionFocusKey(`${region.id}-${Date.now()}`);
    setSelectedRegionId(region.id);
    setSelectedRegion(region);
    void loadSnapshots(region.id, region.activeSnapshotId);
    closeRegionEditor();
  };

  const fetchRegionSnapshot = async (regionId: string, snapshotId: string) => {
    const { data, error } = await $fetch<IApiResponse<RegionResponse>>(`/api/restricted/management/region/${regionId}/${snapshotId}`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load region snapshot:", error);
      return null;
    }

    return data.data;
  };

  const applyRegionView = (region: RegionResponse) => {
    const sortedRegionPoints = [...region.points]
      .sort((a, b) => a.sequence - b.sequence)
      .map((point) => point.point);

    setSelectedRegionId(region.id);
    setSelectedRegion(region);
    setActiveRegionSnapshotId(region.activeSnapshotId);
    void loadSnapshots(region.id, region.activeSnapshotId);
    setFocusedRegionWaypoints(sortedRegionPoints);
    setRegionFocusKey(`${region.id}-${Date.now()}`);
  };

  const handleViewSnapshot = async (snapshotId: string) => {
    if (!selectedRegion) return;

    setIsSnapshotActing(true);
    const snapshotRegion = await fetchRegionSnapshot(selectedRegion.id, snapshotId);
    setIsSnapshotActing(false);

    if (!snapshotRegion) return;
    closeRegionEditor();
    applyRegionView(snapshotRegion);
  };

  const handleEditSnapshot = async (snapshotId: string) => {
    if (!selectedRegion) return;

    const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state === "ready") return;

    setIsSnapshotActing(true);
    const snapshotRegion = await fetchRegionSnapshot(selectedRegion.id, snapshotId);
    setIsSnapshotActing(false);

    if (!snapshotRegion) return;

    applyRegionView(snapshotRegion);
    openRegionEditorForEdit(snapshotRegion);
  };

  const handleCloneSnapshot = async (snapshotId: string) => {
    if (!selectedRegion) return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<SnapshotListItem>>(`/api/restricted/management/region/${selectedRegion.id}/${snapshotId}`, {
      method: "PUT",
    });
    if (error) {
      console.error("Failed to clone region snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    const snapshotRegion = await fetchRegionSnapshot(selectedRegion.id, data.data.id);
    setIsSnapshotActing(false);
    if (!snapshotRegion) return;

    applyRegionView(snapshotRegion);
    openRegionEditorForEdit(snapshotRegion);
    setSelectedSnapshotId(data.data.id);
  };

  const handleSetActiveSnapshot = async (snapshotId: string) => {
    if (!selectedRegion) return;

    const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state !== "ready") return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<RegionResponse>>(`/api/restricted/management/region/${selectedRegion.id}`, {
      method: "PATCH",
      body: { snapshotId },
    });

    if (error) {
      console.error("Failed to switch region snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    closeRegionEditor();
    applyRegionView(data.data);
    setSelectedSnapshotId(snapshotId);
    setActiveRegionSnapshotId(snapshotId);
    setIsSnapshotActing(false);
  };

  const handleCreateBlankSnapshot = async () => {
    if (!selectedRegion) return;

    applyRegionView(selectedRegion);
    openRegionSnapshotEditor(selectedRegion.id);
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!selectedRegion) return;

    const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state === "ready") return;

    const shouldDelete = window.confirm(`Delete snapshot \"${selectedSnapshot.name}\"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setIsSnapshotActing(true);
    const { error } = await $fetch(`/api/restricted/management/region/${selectedRegion.id}/${snapshotId}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete region snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    const nextSnapshots = snapshots.filter((snapshot) => snapshot.id !== snapshotId);
    setSnapshots(nextSnapshots);
    setSelectedSnapshotId(nextSnapshots[0]?.id ?? null);
    setIsSnapshotActing(false);
    await fetchRegions();
  };

  const handleSelectSnapshot = async (snapshotId: string) => {
    setSelectedSnapshotId(snapshotId);
    await handleViewSnapshot(snapshotId);
  };

  const handleDeleteSelected = async () => {
    if (!selectedRegion || isDeletingRegion) return;

    const shouldDelete = window.confirm("Delete this region and all its snapshots? This action cannot be undone.");
    if (!shouldDelete) return;

    setIsDeletingRegion(true);
    const { error } = await $fetch(`/api/restricted/management/region/${selectedRegion.id}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete region:", error);
      setIsDeletingRegion(false);
      return;
    }

    setSelectedRegion(null);
    setSelectedRegionId(null);
    resetSnapshotState();
    closeRegionEditor();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);

    await fetchRegions();
    setIsDeletingRegion(false);
  };

  const handleClearSelectedRegion = () => {
    setSelectedRegion(null);
    setSelectedRegionId(null);
    resetSnapshotState();
    setFocusedRegionWaypoints(undefined);
    setRegionFocusKey(null);
    closeRegionEditor();
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <RegionMapComponent
            regions={mapRegions}
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
            onAddRegion={handleShowRegions}
          />
          {selectedRegion ? (
            <div
              className={`absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 ${
                showRegionEditor ? "pointer-events-none -translate-x-6 opacity-0" : "translate-x-0 opacity-100"
              }`}
            >
              <RegionItemSidebar
                region={selectedRegion}
                snapshots={snapshots}
                selectedSnapshotId={selectedSnapshotId}
                activeSnapshotId={activeRegionSnapshotId}
                isSnapshotLoading={isSnapshotLoading}
                isSnapshotActing={isSnapshotActing}
                isDeletingRegion={isDeletingRegion}
                onClose={handleClearSelectedRegion}
                onDeleteRegion={handleDeleteSelected}
                onSelectSnapshot={handleSelectSnapshot}
                onSetActiveSnapshot={handleSetActiveSnapshot}
                onDeleteSnapshot={handleDeleteSnapshot}
                onEditSnapshot={handleEditSnapshot}
                onCloneSnapshot={handleCloneSnapshot}
                onCreateBlankSnapshot={handleCreateBlankSnapshot}
              />
            </div>
          ) : null}
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
