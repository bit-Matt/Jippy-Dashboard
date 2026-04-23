"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { AppSidebar } from "@/components/app-sidebar";
import ClosureItemSidebar from "@/components/closure-item-sidebar";
import ClosureRegionEditor from "@/components/closure-region-editor";
import RouteListCard from "@/components/route-list-card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import type { ClosureResponse, ClosureResponseList } from "@/contracts/responses";
import { ClosureEditorProvider, useClosureEditor } from "@/contexts/ClosureEditorContext";
import { RouteEditorProvider } from "@/contexts/RouteEditorContext";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ApiResponseBuilder";

import ClosureMapComponent from "./MapComponent";

function ClosureDashboardContent() {
  const [isFetchingClosures, setIsFetchingClosures] = useState(true);
  const [closures, setClosures] = useState<ClosureResponseList>([]);
  const [selectedClosure, setSelectedClosure] = useState<ClosureResponse | null>(null);
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);
  const [closureFocusKey, setClosureFocusKey] = useState<string | number | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeletingClosure, setIsDeletingClosure] = useState(false);
  const selectedClosureRef = useRef<ClosureResponse | null>(null);

  type MeResponse = { data: { ok: boolean; data: { role: string } }; error?: unknown };
  const { data: me } = useSWR<MeResponse>("/api/me", $fetch);
  const userRole = me?.data?.data?.role ?? null;

  const {
    mode: closureMode,
    startCreating,
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
      const refreshedClosure = nextClosures.find((closure) => closure.id === selectedClosureRef.current?.id) ?? null;

      if (!refreshedClosure) {
        setSelectedClosure(null);
        setSelectedClosureId(null);
      } else {
        setSelectedClosure(refreshedClosure);
        setSelectedClosureId(refreshedClosure.id);
      }
    }

    setIsFetchingClosures(false);
  }, []);

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
  };

  const handleClearSelectedClosure = () => {
    setSelectedClosure(null);
    setSelectedClosureId(null);
    setClosureFocusKey(null);
    stopEditing();
  };

  const openClosureEditor = (closure: ClosureResponse) => {
    setSelectedClosure(closure);
    setSelectedClosureId(closure.id);
    setClosureFocusKey(`${closure.id}-${Date.now()}`);
    startEditing(closure);
  };

  const handleEditClosure = () => {
    if (!selectedClosure) {
      return;
    }

    openClosureEditor(selectedClosure);
  };

  const handleTogglePublic = async (nextState: boolean) => {
    if (!selectedClosure || isPublishing) {
      return;
    }

    const closureId = selectedClosure.id;
    setIsPublishing(true);

    const { error } = await $fetch<IApiResponse<{ id: string; isPublic: boolean }>>(
      `/api/restricted/management/closure/${closureId}/publishing`,
      {
        method: "PATCH",
        body: { isPublic: nextState },
      },
    );

    if (error) {
      console.error("Failed to toggle closure publication:", error);
      setIsPublishing(false);
      return;
    }

    setClosures((previousClosures) => previousClosures.map((closure) => (
      closure.id === closureId
        ? { ...closure, isPublic: nextState }
        : closure
    )));

    setSelectedClosure((previousClosure) => {
      if (!previousClosure || previousClosure.id !== closureId) {
        return previousClosure;
      }

      return {
        ...previousClosure,
        isPublic: nextState,
      };
    });

    setIsPublishing(false);
  };

  const handleDeleteClosure = async () => {
    if (!selectedClosure || isDeletingClosure) {
      return;
    }

    const shouldDelete = window.confirm("Delete this closure? This action cannot be undone.");
    if (!shouldDelete) {
      return;
    }

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
    stopEditing();

    await fetchClosures();
    setIsDeletingClosure(false);
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
                userRole={userRole}
                isPublishing={isPublishing}
                isDeletingClosure={isDeletingClosure}
                onClose={handleClearSelectedClosure}
                onEditClosure={handleEditClosure}
                onDeleteClosure={handleDeleteClosure}
                onTogglePublic={handleTogglePublic}
              />
            </div>
          ) : null}

          <ClosureRegionEditor
            onSaved={async () => {
              await fetchClosures();
            }}
          />
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
