"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import ClosureItemSidebar from "@/components/closure-item-sidebar";
import ClosureRegionEditor from "@/components/closure-region-editor";
import RouteListCard from "@/components/route-list-card";
import type { ClosureResponse, ClosureResponseList } from "@/contracts/responses";
import { type SnapshotListItem } from "@/components/snapshot-types";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ClosureEditorProvider, useClosureEditor } from "@/contexts/ClosureEditorContext";
import { RouteEditorProvider } from "@/contexts/RouteEditorContext";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";

import ClosureMapComponent from "./MapComponent";

function ClosureDashboardContent() {
  const [isFetchingClosures, setIsFetchingClosures] = useState(true);
  const [closures, setClosures] = useState<ClosureResponseList>([]);
  const [selectedClosure, setSelectedClosure] = useState<ClosureResponse | null>(null);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);
  const [closureFocusKey, setClosureFocusKey] = useState<string | number | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotActing, setIsSnapshotActing] = useState(false);
  const [isDeletingClosure, setIsDeletingClosure] = useState(false);
  const [closureSnapshots, setClosureSnapshots] = useState<SnapshotListItem[]>([]);
  const [selectedClosureSnapshotId, setSelectedClosureSnapshotId] = useState<string | null>(null);
  const [activeClosureSnapshotId, setActiveClosureSnapshotId] = useState<string | null>(null);
  const selectedClosureRef = useRef<ClosureResponse | null>(null);

  const {
    mode: closureMode,
    startCreating,
    startCreatingSnapshot,
    startEditing,
    stopEditing,
  } = useClosureEditor();

  useEffect(() => {
    selectedClosureRef.current = selectedClosure;
  }, [selectedClosure]);

  const mapClosures = useMemo(() => {
    if (!selectedClosure) {
      return closures;
    }

    return [selectedClosure];
  }, [closures, selectedClosure]);

  const fetchClosureSnapshot = useCallback(async (closureId: string, snapshotId: string) => {
    const { data, error } = await $fetch<IApiResponse<ClosureResponse>>(`/api/restricted/management/closure/${closureId}/${snapshotId}`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load closure snapshot:", error);
      return null;
    }

    return data.data;
  }, []);

  const loadClosureSnapshots = useCallback(async (closure: ClosureResponse) => {
    setIsSnapshotLoading(true);
    const { data, error } = await $fetch<IApiResponse<SnapshotListItem[]>>(`/api/restricted/management/closure/${closure.id}/snapshots`, {
      method: "GET",
    });

    if (error) {
      console.error("Failed to load closure snapshots:", error);
      setIsSnapshotLoading(false);
      return;
    }

    setClosureSnapshots(data.data);
    setSelectedClosureSnapshotId(closure.activeSnapshotId);
    setActiveClosureSnapshotId(closure.activeSnapshotId);
    setIsSnapshotLoading(false);
  }, []);

  const fetchClosures = useCallback(async () => {
    setIsFetchingClosures(true);

    const { data, error } = await $fetch<IApiResponse<ClosureResponseList>>("/api/restricted/management/closure", {
      method: "GET",
    });

    if (error) {
      console.error("Failed to fetch closures:", error);
      setIsFetchingClosures(false);
      return;
    }

    const nextClosures = data.data;
    setClosures(nextClosures);

    if (selectedClosureRef.current) {
      const selectedClosureSnapshotId = selectedClosureRef.current.activeSnapshotId;
      const refreshedClosure = nextClosures.find((closure) => closure.id === selectedClosureRef.current?.id) ?? null;

      if (!refreshedClosure) {
        setSelectedClosure(null);
        setSelectedClosureId(null);
        setClosureSnapshots([]);
        setSelectedClosureSnapshotId(null);
        setActiveClosureSnapshotId(null);
      } else {
        const preservedSnapshot = selectedClosureSnapshotId && selectedClosureSnapshotId !== refreshedClosure.activeSnapshotId
          ? await fetchClosureSnapshot(refreshedClosure.id, selectedClosureSnapshotId)
          : null;

        const nextSelectedClosure = preservedSnapshot ?? refreshedClosure;
        setSelectedClosure(nextSelectedClosure);
        setSelectedClosureId(nextSelectedClosure.id);
        setActiveClosureSnapshotId(refreshedClosure.activeSnapshotId);
        void loadClosureSnapshots(refreshedClosure);
      }
    }

    setIsFetchingClosures(false);
  }, [fetchClosureSnapshot, loadClosureSnapshots]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void fetchClosures();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchClosures]);

  const handleShowClosureEditor = () => {
    if (closureMode === "creating" || closureMode === "editing") {
      stopEditing();
      return;
    }

    setSelectedClosure(null);
    setSelectedClosureId(null);
    setClosureFocusKey(null);
    startCreating();
  };

  const handleSelectClosure = (closure: ClosureResponse) => {
    stopEditing();
    setSelectedClosure(closure);
    setSelectedClosureId(closure.id);
    setClosureFocusKey(`${closure.id}-${Date.now()}`);
    void loadClosureSnapshots(closure);
  };

  const handleClearSelectedClosure = () => {
    setSelectedClosure(null);
    setSelectedClosureId(null);
    setSelectedClosureSnapshotId(null);
    setActiveClosureSnapshotId(null);
    setClosureFocusKey(null);
    stopEditing();
  };

  const openClosureEditor = (closure: ClosureResponse) => {
    setSelectedClosure(closure);
    setSelectedClosureId(closure.id);
    setClosureFocusKey(`${closure.id}-${Date.now()}`);
    startEditing(closure);
  };

  const handleDeleteClosure = async () => {
    if (!selectedClosure || isDeletingClosure) return;

    const shouldDelete = window.confirm("Delete this closure and all its snapshots? This action cannot be undone.");
    if (!shouldDelete) return;

    setIsDeletingClosure(true);
    const { error } = await $fetch(`/api/restricted/management/closure/${selectedClosure.id}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete closure:", error);
      setIsDeletingClosure(false);
      return;
    }

    setSelectedClosure(null);
    setSelectedClosureId(null);
    setSelectedClosureSnapshotId(null);
    stopEditing();

    await fetchClosures();
    setIsDeletingClosure(false);
  };

  const handleViewClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;
    setIsSnapshotActing(true);
    const closureSnapshot = await fetchClosureSnapshot(selectedClosure.id, snapshotId);
    setIsSnapshotActing(false);
    if (!closureSnapshot) return;

    setSelectedClosure(closureSnapshot);
    setSelectedClosureId(closureSnapshot.id);
    setClosureFocusKey(`${closureSnapshot.id}-${Date.now()}`);
    stopEditing();
  };

  const handleEditClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;
    const selectedSnapshot = closureSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state === "ready") return;

    setIsSnapshotActing(true);
    const closureSnapshot = await fetchClosureSnapshot(selectedClosure.id, snapshotId);
    setIsSnapshotActing(false);
    if (!closureSnapshot) return;

    openClosureEditor(closureSnapshot);
  };

  const handleCloneClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<SnapshotListItem>>(`/api/restricted/management/closure/${selectedClosure.id}/${snapshotId}`, {
      method: "PUT",
    });
    if (error) {
      console.error("Failed to clone closure snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    const closureSnapshot = await fetchClosureSnapshot(selectedClosure.id, data.data.id);
    setIsSnapshotActing(false);
    if (!closureSnapshot) return;

    openClosureEditor(closureSnapshot);
    setSelectedClosureSnapshotId(data.data.id);
  };

  const handleSetActiveClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;

    const selectedSnapshot = closureSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state !== "ready") return;

    setIsSnapshotActing(true);
    const { data, error } = await $fetch<IApiResponse<ClosureResponse>>(`/api/restricted/management/closure/${selectedClosure.id}`, {
      method: "PATCH",
      body: { snapshotId },
    });

    if (error) {
      console.error("Failed to switch closure snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    setSelectedClosure(data.data);
    setSelectedClosureId(data.data.id);
    setSelectedClosureSnapshotId(snapshotId);
    setActiveClosureSnapshotId(snapshotId);
    setClosureFocusKey(`${data.data.id}-${Date.now()}`);
    setIsSnapshotActing(false);
    void loadClosureSnapshots(data.data);
  };

  const handleCreateBlankClosureSnapshot = () => {
    if (!selectedClosure) return;

    startCreatingSnapshot(selectedClosure.id);
  };

  const handleDeleteClosureSnapshot = async (snapshotId: string) => {
    if (!selectedClosure) return;

    const selectedSnapshot = closureSnapshots.find((snapshot) => snapshot.id === snapshotId);
    if (!selectedSnapshot || selectedSnapshot.state === "ready") return;

    const shouldDelete = window.confirm(`Delete snapshot \"${selectedSnapshot.name}\"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setIsSnapshotActing(true);
    const { error } = await $fetch(`/api/restricted/management/closure/${selectedClosure.id}/${snapshotId}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete closure snapshot:", error);
      setIsSnapshotActing(false);
      return;
    }

    const nextSnapshots = closureSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    setClosureSnapshots(nextSnapshots);
    setSelectedClosureSnapshotId(nextSnapshots[0]?.id ?? null);
    setIsSnapshotActing(false);
    await fetchClosures();
  };

  const handleSelectClosureSnapshot = async (snapshotId: string) => {
    setSelectedClosureSnapshotId(snapshotId);
    await handleViewClosureSnapshot(snapshotId);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="relative z-0 mt-4 flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
          <ClosureMapComponent
            closures={mapClosures}
            onClosureClick={handleSelectClosure}
            focusedWaypoints={selectedClosure
              ? [...selectedClosure.points]
                .sort((a, b) => a.sequence - b.sequence)
                .map((point) => point.point)
              : undefined}
            focusKey={closureFocusKey}
          />
          <RouteListCard
            mode="closures"
            routes={[]}
            regions={[]}
            closures={closures}
            isRoutesLoading={isFetchingClosures}
            selectedRouteId={null}
            selectedRegionId={null}
            selectedClosureId={selectedClosureId}
            onClosureSelect={handleSelectClosure}
            onAddClosure={handleShowClosureEditor}
          />

          {selectedClosure ? (
            <div
              className={`absolute top-2 left-6 z-9998 w-1/4 transition-all duration-200 ${
                closureMode === "creating" || closureMode === "editing"
                  ? "pointer-events-none -translate-x-6 opacity-0"
                  : "translate-x-0 opacity-100"
              }`}
            >
              <ClosureItemSidebar
                closure={selectedClosure}
                snapshots={closureSnapshots}
                selectedSnapshotId={selectedClosureSnapshotId}
                activeSnapshotId={activeClosureSnapshotId}
                isSnapshotLoading={isSnapshotLoading}
                isSnapshotActing={isSnapshotActing}
                isDeletingClosure={isDeletingClosure}
                onClose={handleClearSelectedClosure}
                onDeleteClosure={handleDeleteClosure}
                onSelectSnapshot={handleSelectClosureSnapshot}
                onSetActiveSnapshot={handleSetActiveClosureSnapshot}
                onDeleteSnapshot={handleDeleteClosureSnapshot}
                onEditSnapshot={handleEditClosureSnapshot}
                onCloneSnapshot={handleCloneClosureSnapshot}
                onCreateBlankSnapshot={handleCreateBlankClosureSnapshot}
              />
            </div>
          ) : null}

          <ClosureRegionEditor onSaved={async () => {
            await fetchClosures();

            if (selectedClosure?.id && selectedClosure?.activeSnapshotId) {
              const refreshedSnapshot = await fetchClosureSnapshot(selectedClosure.id, selectedClosure.activeSnapshotId);
              if (refreshedSnapshot) {
                setSelectedClosure(refreshedSnapshot);
                setSelectedClosureId(refreshedSnapshot.id);
                setClosureFocusKey(`${refreshedSnapshot.id}-${Date.now()}`);
              }
            }
          }} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function ClosureDashboardPage() {
  return (
    <RouteEditorProvider>
      <ClosureEditorProvider>
        <ClosureDashboardContent />
      </ClosureEditorProvider>
    </RouteEditorProvider>
  );
}
