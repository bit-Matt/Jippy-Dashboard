"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { ClosureObject } from "@/lib/management/index";

type ClosureMode = "idle" | "creating" | "editing";
export type ActiveClosureTool = "none" | "draw-polygon" | "edit-polygon";

interface ClosureDraftPoint {
  id: string;
  sequence: number;
  point: [number, number];
}

interface ClosureEditorState {
  mode: ClosureMode;
  activeClosureId: string | null;
  activeSnapshotId: string | null;
  activeClosureTool: ActiveClosureTool;
  draft: {
    versionName: string;
    snapshotState: "wip" | "for_approval" | "ready";
    shape: string;
    closureName: string;
    closureDescription: string;
    points: ClosureDraftPoint[];
  } | null;
}

interface ClosureEditorContextValue extends ClosureEditorState {
  hasDefinedPolygon: boolean;
  startCreating: () => void;
  startCreatingSnapshot: (closureId: string) => void;
  startEditing: (closure: ClosureObject) => void;
  stopEditing: () => void;
  setPolygonPoints: (points: Array<[number, number]>) => void;
  clearPolygon: () => void;
  setActiveClosureTool: (tool: ActiveClosureTool) => void;
  finishClosureToolEditing: () => void;
  setClosureName: (name: string) => void;
  setClosureDescription: (description: string) => void;
  setVersionName: (name: string) => void;
  setSnapshotState: (state: "wip" | "for_approval" | "ready") => void;
}

const ClosureEditorContext = createContext<ClosureEditorContextValue | undefined>(undefined);

export function ClosureEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClosureEditorState>({
    mode: "idle",
    activeClosureId: null,
    activeSnapshotId: null,
    activeClosureTool: "none",
    draft: null,
  });

  const startCreating = useCallback(() => {
    setState({
      mode: "creating",
      activeClosureId: null,
      activeSnapshotId: null,
      activeClosureTool: "draw-polygon",
      draft: {
        versionName: "v1",
        snapshotState: "wip",
        shape: "polygon",
        closureName: "",
        closureDescription: "",
        points: [],
      },
    });
  }, []);

  const startEditing = useCallback((closure: ClosureObject) => {
    const sortedPoints = [...closure.points].sort((a, b) => a.sequence - b.sequence);

    setState({
      mode: "editing",
      activeClosureId: closure.id,
      activeSnapshotId: closure.activeSnapshotId,
      activeClosureTool: "draw-polygon",
      draft: {
        versionName: closure.versionName ?? "Draft",
        snapshotState: (closure.snapshotState as "wip" | "for_approval" | "ready") ?? "wip",
        shape: closure.shape || "polygon",
        closureName: closure.closureName,
        closureDescription: closure.closureDescription,
        points: sortedPoints.map((point, index) => ({
          id: String(point.id ?? crypto.randomUUID()),
          sequence: index + 1,
          point: point.point,
        })),
      },
    });
  }, []);

  const startCreatingSnapshot = useCallback((closureId: string) => {
    setState({
      mode: "creating",
      activeClosureId: closureId,
      activeSnapshotId: null,
      activeClosureTool: "draw-polygon",
      draft: {
        versionName: "v1",
        snapshotState: "wip",
        shape: "polygon",
        closureName: "",
        closureDescription: "",
        points: [],
      },
    });
  }, []);

  const stopEditing = useCallback(() => {
    setState({
      mode: "idle",
      activeClosureId: null,
      activeSnapshotId: null,
      activeClosureTool: "none",
      draft: null,
    });
  }, []);

  const setPolygonPoints = useCallback((points: Array<[number, number]>) => {
    setState((prev) => {
      if (!prev.draft) return prev;

      const normalizedPoints = points.map((point, index) => ({
        id: prev.draft?.points[index]?.id ?? crypto.randomUUID(),
        sequence: index + 1,
        point,
      }));

      return {
        ...prev,
        draft: {
          ...prev.draft,
          points: normalizedPoints,
        },
      };
    });
  }, []);

  const clearPolygon = useCallback(() => {
    setState((prev) => {
      if (!prev.draft) return prev;

      return {
        ...prev,
        activeClosureTool: "none",
        draft: {
          ...prev.draft,
          points: [],
        },
      };
    });
  }, []);

  const setActiveClosureTool = useCallback((tool: ActiveClosureTool) => {
    setState((prev) => ({
      ...prev,
      activeClosureTool: tool,
    }));
  }, []);

  const finishClosureToolEditing = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeClosureTool: "none",
    }));
  }, []);

  const setClosureName = useCallback((closureName: string) => {
    setState((prev) => {
      if (!prev.draft) return prev;

      return {
        ...prev,
        draft: {
          ...prev.draft,
          closureName,
        },
      };
    });
  }, []);

  const setClosureDescription = useCallback((closureDescription: string) => {
    setState(prev => (prev.draft
      ? {
        ...prev,
        draft: {
          ...prev.draft,
          closureDescription,
        },
      }
      : prev));
  }, []);

  const setVersionName = useCallback((versionName: string) => {
    setState((prev) => {
      if (!prev.draft) return prev;

      return {
        ...prev,
        draft: {
          ...prev.draft,
          versionName,
        },
      };
    });
  }, []);

  const setSnapshotState = useCallback((snapshotState: "wip" | "for_approval" | "ready") => {
    setState((prev) => {
      if (!prev.draft) return prev;

      return {
        ...prev,
        draft: {
          ...prev.draft,
          snapshotState,
        },
      };
    });
  }, []);

  const value = useMemo<ClosureEditorContextValue>(
    () => ({
      ...state,
      hasDefinedPolygon: (state.draft?.points.length ?? 0) >= 3,
      startCreating,
      startCreatingSnapshot,
      startEditing,
      stopEditing,
      setPolygonPoints,
      clearPolygon,
      setActiveClosureTool,
      finishClosureToolEditing,
      setClosureName,
      setClosureDescription,
      setVersionName,
      setSnapshotState,
    }),
    [
      state,
      startCreating,
      startCreatingSnapshot,
      startEditing,
      stopEditing,
      setPolygonPoints,
      clearPolygon,
      setActiveClosureTool,
      finishClosureToolEditing,
      setClosureName,
      setClosureDescription,
      setVersionName,
      setSnapshotState,
    ],
  );

  return (
    <ClosureEditorContext.Provider value={value}>
      {children}
    </ClosureEditorContext.Provider>
  );
}

export function useClosureEditor() {
  const ctx = useContext(ClosureEditorContext);
  if (!ctx) {
    throw new Error("useClosureEditor must be used within a ClosureEditorProvider");
  }
  return ctx;
}

