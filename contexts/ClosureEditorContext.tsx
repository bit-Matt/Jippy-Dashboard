"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { ClosureObject } from "@/contracts/responses";

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
  activeClosureTool: ActiveClosureTool;
  draft: {
    shape: string;
    closureName: string;
    closureDescription: string;
    points: ClosureDraftPoint[];
  } | null;
}

interface ClosureEditorContextValue extends ClosureEditorState {
  hasDefinedPolygon: boolean;
  startCreating: () => void;
  startEditing: (closure: ClosureObject) => void;
  stopEditing: () => void;
  setPolygonPoints: (points: Array<[number, number]>) => void;
  clearPolygon: () => void;
  setActiveClosureTool: (tool: ActiveClosureTool) => void;
  finishClosureToolEditing: () => void;
  setClosureName: (name: string) => void;
  setClosureDescription: (description: string) => void;
}

const ClosureEditorContext = createContext<ClosureEditorContextValue | undefined>(undefined);

export function ClosureEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClosureEditorState>({
    mode: "idle",
    activeClosureId: null,
    activeClosureTool: "none",
    draft: null,
  });

  const startCreating = useCallback(() => {
    setState({
      mode: "creating",
      activeClosureId: null,
      activeClosureTool: "draw-polygon",
      draft: {
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
      activeClosureTool: sortedPoints.length >= 3 ? "edit-polygon" : "draw-polygon",
      draft: {
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

  const stopEditing = useCallback(() => {
    setState({
      mode: "idle",
      activeClosureId: null,
      activeClosureTool: "none",
      draft: null,
    });
  }, []);

  const setPolygonPoints = useCallback((points: Array<[number, number]>) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      const normalizedPoints = points.map((point, index) => ({
        id: previousState.draft?.points[index]?.id ?? crypto.randomUUID(),
        sequence: index + 1,
        point,
      }));

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          points: normalizedPoints,
        },
      };
    });
  }, []);

  const clearPolygon = useCallback(() => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        activeClosureTool: "draw-polygon",
        draft: {
          ...previousState.draft,
          points: [],
        },
      };
    });
  }, []);

  const setActiveClosureTool = useCallback((tool: ActiveClosureTool) => {
    setState((previousState) => ({
      ...previousState,
      activeClosureTool: tool,
    }));
  }, []);

  const finishClosureToolEditing = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      activeClosureTool: "none",
    }));
  }, []);

  const setClosureName = useCallback((closureName: string) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          closureName,
        },
      };
    });
  }, []);

  const setClosureDescription = useCallback((closureDescription: string) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          closureDescription,
        },
      };
    });
  }, []);

  const value = useMemo<ClosureEditorContextValue>(
    () => ({
      ...state,
      hasDefinedPolygon: (state.draft?.points.length ?? 0) >= 3,
      startCreating,
      startEditing,
      stopEditing,
      setPolygonPoints,
      clearPolygon,
      setActiveClosureTool,
      finishClosureToolEditing,
      setClosureName,
      setClosureDescription,
    }),
    [
      state,
      startCreating,
      startEditing,
      stopEditing,
      setPolygonPoints,
      clearPolygon,
      setActiveClosureTool,
      finishClosureToolEditing,
      setClosureName,
      setClosureDescription,
    ],
  );

  return (
    <ClosureEditorContext.Provider value={value}>
      {children}
    </ClosureEditorContext.Provider>
  );
}

export function useClosureEditor() {
  const contextValue = useContext(ClosureEditorContext);
  if (!contextValue) {
    throw new Error("useClosureEditor must be used within a ClosureEditorProvider");
  }

  return contextValue;
}
