"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { ClosureLineObject, ClosureRegionObject } from "@/lib/management";

type ClosureMode = "idle" | "creating-line" | "creating-region" | "editing-line" | "editing-region";

interface ClosureLineDraftPoint {
  id: string;
  sequence: number;
  address: string;
  point: [number, number];
}

interface ClosureRegionDraftPoint {
  id: string;
  sequence: number;
  point: [number, number];
}

interface ClosureEditorState {
  mode: ClosureMode;
  activeClosureId: string | null;
  activeLinePointId: string | null;
  lineDraft: {
    label: string;
    color: string;
    direction: "one_way" | "both";
    points: ClosureLineDraftPoint[];
  } | null;
  regionDraft: {
    label: string;
    color: string;
    points: ClosureRegionDraftPoint[];
  } | null;
}

interface ClosureEditorContextValue extends ClosureEditorState {
  startCreatingLine: () => void;
  startCreatingRegion: () => void;
  startEditingLine: (closure: ClosureLineObject) => void;
  startEditingRegion: (closure: ClosureRegionObject) => void;
  stopEditing: () => void;
  setActiveLinePointId: (id: string | null) => void;
  addLinePoint: (lat: number, lng: number) => void;
  updateLinePoint: (id: string, lat: number, lng: number) => void;
  removeLinePoint: (id: string) => void;
  setLinePointAddress: (id: string, address: string) => void;
  setLineDirection: (direction: "one_way" | "both") => void;
  setLineLabel: (label: string) => void;
  setLineColor: (color: string) => void;
  addRegionPoint: (lat: number, lng: number) => void;
  updateRegionPoint: (id: string, lat: number, lng: number) => void;
  setRegionLabel: (label: string) => void;
  setRegionColor: (color: string) => void;
}

const ClosureEditorContext = createContext<ClosureEditorContextValue | undefined>(undefined);

export function ClosureEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClosureEditorState>({
    mode: "idle",
    activeClosureId: null,
    activeLinePointId: null,
    lineDraft: null,
    regionDraft: null,
  });

  const startCreatingLine = useCallback(() => {
    setState({
      mode: "creating-line",
      activeClosureId: null,
      activeLinePointId: null,
      lineDraft: {
        label: "",
        color: "#ef4444",
        direction: "both",
        points: [],
      },
      regionDraft: null,
    });
  }, []);

  const startCreatingRegion = useCallback(() => {
    setState({
      mode: "creating-region",
      activeClosureId: null,
      activeLinePointId: null,
      lineDraft: null,
      regionDraft: {
        label: "",
        color: "#ef4444",
        points: [],
      },
    });
  }, []);

  const startEditingLine = useCallback((closure: ClosureLineObject) => {
    setState({
      mode: "editing-line",
      activeClosureId: closure.id,
      activeLinePointId: null,
      lineDraft: {
        label: closure.label,
        color: closure.color,
        direction: closure.direction,
        points: closure.points.map(p => ({
          id: String(p.id),
          sequence: p.sequence,
          address: p.address,
          point: p.point,
        })),
      },
      regionDraft: null,
    });
  }, []);

  const startEditingRegion = useCallback((closure: ClosureRegionObject) => {
    setState({
      mode: "editing-region",
      activeClosureId: closure.id,
      activeLinePointId: null,
      lineDraft: null,
      regionDraft: {
        label: closure.label,
        color: closure.color,
        points: closure.points.map(p => ({
          id: String(p.id),
          sequence: p.sequence,
          point: p.point,
        })),
      },
    });
  }, []);

  const stopEditing = useCallback(() => {
    setState({
      mode: "idle",
      activeClosureId: null,
      activeLinePointId: null,
      lineDraft: null,
      regionDraft: null,
    });
  }, []);

  const setActiveLinePointId = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      activeLinePointId: id,
    }));
  }, []);

  const addLinePoint = useCallback((lat: number, lng: number) => {
    setState(prev => {
      if (!prev.lineDraft) return prev;

      const nextSeq = prev.lineDraft.points.length === 0
        ? 1
        : Math.max(...prev.lineDraft.points.map(p => p.sequence)) + 1;

      return {
        ...prev,
        lineDraft: {
          ...prev.lineDraft,
          points: [
            ...prev.lineDraft.points,
            {
              id: crypto.randomUUID(),
              sequence: nextSeq,
              address: "",
              point: [lat, lng],
            },
          ],
        },
      };
    });
  }, []);

  const updateLinePoint = useCallback((id: string, lat: number, lng: number) => {
    setState(prev => {
      if (!prev.lineDraft) return prev;

      return {
        ...prev,
        lineDraft: {
          ...prev.lineDraft,
          points: prev.lineDraft.points.map(p => (p.id === id
            ? { ...p, point: [lat, lng] }
            : p)),
        },
      };
    });
  }, []);

  const removeLinePoint = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.lineDraft) return prev;

      const remaining = prev.lineDraft.points
        .filter((p) => p.id !== id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((p, index) => ({ ...p, sequence: index + 1 }));

      return {
        ...prev,
        activeLinePointId: prev.activeLinePointId === id ? null : prev.activeLinePointId,
        lineDraft: {
          ...prev.lineDraft,
          points: remaining,
        },
      };
    });
  }, []);

  const setLinePointAddress = useCallback((id: string, address: string) => {
    setState((prev) => {
      if (!prev.lineDraft) return prev;

      return {
        ...prev,
        lineDraft: {
          ...prev.lineDraft,
          points: prev.lineDraft.points.map((p) => (p.id === id ? { ...p, address } : p)),
        },
      };
    });
  }, []);

  const setLineDirection = useCallback((direction: "one_way" | "both") => {
    setState(prev => (prev.lineDraft
      ? {
        ...prev,
        lineDraft: {
          ...prev.lineDraft,
          direction,
        },
      }
      : prev));
  }, []);

  const setLineLabel = useCallback((label: string) => {
    setState(prev => (prev.lineDraft
      ? {
        ...prev,
        lineDraft: {
          ...prev.lineDraft,
          label,
        },
      }
      : prev));
  }, []);

  const setLineColor = useCallback((color: string) => {
    setState(prev => (prev.lineDraft
      ? {
        ...prev,
        lineDraft: {
          ...prev.lineDraft,
          color,
        },
      }
      : prev));
  }, []);

  const addRegionPoint = useCallback((lat: number, lng: number) => {
    setState(prev => {
      if (!prev.regionDraft) return prev;

      const nextSeq = prev.regionDraft.points.length === 0
        ? 1
        : Math.max(...prev.regionDraft.points.map(p => p.sequence)) + 1;

      return {
        ...prev,
        regionDraft: {
          ...prev.regionDraft,
          points: [
            ...prev.regionDraft.points,
            {
              id: crypto.randomUUID(),
              sequence: nextSeq,
              point: [lat, lng],
            },
          ],
        },
      };
    });
  }, []);

  const updateRegionPoint = useCallback((id: string, lat: number, lng: number) => {
    setState(prev => {
      if (!prev.regionDraft) return prev;

      return {
        ...prev,
        regionDraft: {
          ...prev.regionDraft,
          points: prev.regionDraft.points.map(p => (p.id === id
            ? { ...p, point: [lat, lng] }
            : p)),
        },
      };
    });
  }, []);

  const setRegionLabel = useCallback((label: string) => {
    setState(prev => (prev.regionDraft
      ? {
        ...prev,
        regionDraft: {
          ...prev.regionDraft,
          label,
        },
      }
      : prev));
  }, []);

  const setRegionColor = useCallback((color: string) => {
    setState(prev => (prev.regionDraft
      ? {
        ...prev,
        regionDraft: {
          ...prev.regionDraft,
          color,
        },
      }
      : prev));
  }, []);

  const value = useMemo<ClosureEditorContextValue>(
    () => ({
      ...state,
      startCreatingLine,
      startCreatingRegion,
      startEditingLine,
      startEditingRegion,
      stopEditing,
      setActiveLinePointId,
      addLinePoint,
      updateLinePoint,
      removeLinePoint,
      setLinePointAddress,
      setLineDirection,
      setLineLabel,
      setLineColor,
      addRegionPoint,
      updateRegionPoint,
      setRegionLabel,
      setRegionColor,
    }),
    [
      state,
      startCreatingLine,
      startCreatingRegion,
      startEditingLine,
      startEditingRegion,
      stopEditing,
      setActiveLinePointId,
      addLinePoint,
      updateLinePoint,
      removeLinePoint,
      setLinePointAddress,
      setLineDirection,
      setLineLabel,
      setLineColor,
      addRegionPoint,
      updateRegionPoint,
      setRegionLabel,
      setRegionColor,
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

