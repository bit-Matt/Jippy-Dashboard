"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AppSidebar, type AllResponse } from "@/components/app-sidebar";
import RegionEditor from "@/components/region-editor";
import RouteListCard from "@/components/route-list-card";
import SnapshotManagerDialog, { type SnapshotListItem } from "@/components/snapshot-manager-dialog";
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
  const selectedRegion = useMemo(
    () => selectedRegionId ? (regions.find((region) => region.id === selectedRegionId) ?? null) : null,
    [regions, selectedRegionId],
  );

  const [focusedRegionWaypoints, setFocusedRegionWaypoints] = useState<Array<[number, number]> | undefined>(undefined);
  const [regionFocusKey, setRegionFocusKey] = useState<string | number | null>(null);
  const [isSnapshotDialogOpen, setIsSnapshotDialogOpen] = useState(false);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotActing, setIsSnapshotActing] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const {
    showRegionEditor,
    mutationVersion,
    openRegionEditor,
    openRegionEditorForEdit,
    closeRegionEditor,
  } = useRegionEditor();

  const selectedModeLabel = showRegionEditor
    ? "Edit Mode"
    : selectedRegion
      ? "View Mode"
      : null;

  const fetchRegions = useCallback(async () => {
    setIsFetchingRegions(true);

    const { data, error } = await $fetch<IApiResponse<AllResponse>>("/api/restricted/management/route", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch regions:", error);
      setIsFetchingRegions(false);
      return;
    }

    const nextRegions = data.data.regions;
    setRegions(nextRegions);

    if (selectedRegionId && !nextRegions.some((region) => region.id === selectedRegionId)) {
      setSelectedRegionId(null);
    }

    setIsFetchingRegions(false);
  }, [selectedRegionId]);

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
    closeRegionEditor();
  };

  const loadSnapshots = async (region: AllResponse["regions"][0]) => {
    setIsSnapshotLoading(true);

    const { data, error } = await $fetch<IApiResponse<SnapshotListItem[]>>(`/api/restricted/management/region/${region.id}/snapshots`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load region snapshots:", error);
      setIsSnapshotLoading(false);
      return;
    }

    setSnapshots(data.data);
    setSelectedSnapshotId(region.activeSnapshotId);
    setIsSnapshotLoading(false);
  };

  const fetchRegionSnapshot = async (regionId: string, snapshotId: string) => {
    const { data, error } = await $fetch<IApiResponse<AllResponse["regions"][0]>>(`/api/restricted/management/region/${regionId}/${snapshotId}`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load region snapshot:", error);
      return null;
    }

    return data.data;
  };

  const applyRegionView = (region: AllResponse["regions"][0]) => {
    const sortedRegionPoints = [...region.points]
      .sort((a, b) => a.sequence - b.sequence)
      .map((point) => point.point);

    setSelectedRegionId(region.id);
    setFocusedRegionWaypoints(sortedRegionPoints);
    setRegionFocusKey(`${region.id}-${Date.now()}`);
  };

  const handleManageSnapshots = async () => {
    if (!selectedRegion) return;
    setIsSnapshotDialogOpen(true);
    await loadSnapshots(selectedRegion);
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
    setIsSnapshotDialogOpen(false);
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
    await loadSnapshots(snapshotRegion);
    setSelectedSnapshotId(data.data.id);
    setIsSnapshotDialogOpen(false);
  };

  const handleSwitchActiveSnapshot = async (snapshotId: string) => {
    if (!selectedRegion) return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<AllResponse["regions"][0]>>(`/api/restricted/management/region/${selectedRegion.id}`, {
      method: "PATCH",
      body: { snapshotId },
    });

    if (error) {
      console.error("Failed to switch region snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    applyRegionView(data.data);
    await fetchRegions();
    setSelectedSnapshotId(snapshotId);
    setIsSnapshotActing(false);
    setIsSnapshotDialogOpen(false);
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
            onManageSnapshots={handleManageSnapshots}
            manageSnapshotsDisabled={!selectedRegionId}
            selectedItemVersionName={selectedRegion?.snapshotName ?? null}
            selectedItemSnapshotState={selectedRegion?.snapshotState ?? null}
            selectedItemModeLabel={selectedModeLabel}
          />
          {showRegionEditor ? <RegionEditor /> : null}
          <SnapshotManagerDialog
            open={isSnapshotDialogOpen}
            title="Region Snapshots"
            description="Select a version to view, edit, clone, or switch as active."
            snapshots={snapshots}
            selectedSnapshotId={selectedSnapshotId}
            isLoading={isSnapshotLoading}
            isActing={isSnapshotActing}
            onOpenChange={setIsSnapshotDialogOpen}
            onSelectSnapshot={setSelectedSnapshotId}
            onViewSnapshot={handleViewSnapshot}
            onEditSnapshot={handleEditSnapshot}
            onCloneSnapshot={handleCloneSnapshot}
            onSwitchActiveSnapshot={handleSwitchActiveSnapshot}
          />
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
