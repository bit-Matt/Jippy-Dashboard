"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { StopResponse, StopRestrictionType, StopDisallowedDirection } from "@/contracts/responses";

export type StopEditorMode = "creating" | "editing";
export type ActiveStopTool = "none" | "draw-line" | "edit-line";

type DashboardPanelMode = "list" | "details" | "editor";

export interface StopDraftPoint {
  id: string;
  sequence: number;
  point: [number, number];
}

interface StopDraft {
  name: string;
  restrictionType: StopRestrictionType;
  disallowedDirection: StopDisallowedDirection;
  points: StopDraftPoint[];
  routeIds: string[];
  vehicleTypeIds: string[];
}

interface StopDashboardState {
  panelMode: DashboardPanelMode;
  selectedStop: StopResponse | null;
  selectedStopId: string | null;
  editorMode: StopEditorMode | null;
  activeStopTool: ActiveStopTool;
  draft: StopDraft | null;
  focusWaypoints: Array<[number, number]> | undefined;
  focusKey: string | number | null;
  autoDrawRequested: boolean;
}

interface StopDashboardContextValue extends StopDashboardState {
  selectStop: (stop: StopResponse) => void;
  clearSelection: () => void;
  openCreateEditor: () => void;
  openEditEditor: (stop: StopResponse) => void;
  closeEditor: () => void;
  updateDraftName: (name: string) => void;
  updateDraftRestrictionType: (restrictionType: StopRestrictionType) => void;
  updateDraftDisallowedDirection: (disallowedDirection: StopDisallowedDirection) => void;
  updateDraftRouteIds: (routeIds: string[]) => void;
  updateDraftVehicleTypeIds: (vehicleTypeIds: string[]) => void;
  updateDraftPoints: (points: Array<[number, number]>) => void;
  setActiveStopTool: (tool: ActiveStopTool) => void;
  finishStopToolEditing: () => void;
  consumeAutoDrawRequest: () => void;
  setSelectedStopPublicState: (isPublic: boolean) => void;
  syncSelectedStop: (stop: StopResponse | null) => void;
}

const StopDashboardContext = createContext<StopDashboardContextValue | undefined>(undefined);

const buildDraftFromStop = (stop: StopResponse): StopDraft => ({
  name: stop.name,
  restrictionType: stop.restrictionType,
  disallowedDirection: stop.disallowedDirection,
  points: [...stop.points]
    .sort((a, b) => a.sequence - b.sequence)
    .map((point, index) => ({
      id: point.id || crypto.randomUUID(),
      sequence: index + 1,
      point: point.point,
    })),
  routeIds: [...stop.routeIds],
  vehicleTypeIds: [...stop.vehicleTypeIds],
});

const buildFocusWaypoints = (stop: StopResponse | null): Array<[number, number]> | undefined => {
  if (!stop) {
    return undefined;
  }

  const points = [...stop.points]
    .sort((a, b) => a.sequence - b.sequence)
    .map((point) => point.point)
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  return points.length > 0 ? points : undefined;
};

const buildEmptyDraft = (): StopDraft => ({
  name: "",
  restrictionType: "universal",
  disallowedDirection: "both",
  points: [],
  routeIds: [],
  vehicleTypeIds: [],
});

export function StopDashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StopDashboardState>({
    panelMode: "list",
    selectedStop: null,
    selectedStopId: null,
    editorMode: null,
    activeStopTool: "none",
    draft: null,
    focusWaypoints: undefined,
    focusKey: null,
    autoDrawRequested: false,
  });

  const selectStop = useCallback((stop: StopResponse) => {
    setState((previousState) => ({
      ...previousState,
      panelMode: "details",
      selectedStop: stop,
      selectedStopId: stop.id,
      editorMode: null,
      activeStopTool: "none",
      draft: null,
      focusWaypoints: buildFocusWaypoints(stop),
      focusKey: `${stop.id}-${Date.now()}`,
      autoDrawRequested: false,
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      panelMode: "list",
      selectedStop: null,
      selectedStopId: null,
      editorMode: null,
      activeStopTool: "none",
      draft: null,
      focusWaypoints: undefined,
      focusKey: null,
      autoDrawRequested: false,
    }));
  }, []);

  const openCreateEditor = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      panelMode: "editor",
      selectedStop: null,
      selectedStopId: null,
      editorMode: "creating",
      activeStopTool: "draw-line",
      draft: buildEmptyDraft(),
      focusWaypoints: undefined,
      focusKey: null,
      autoDrawRequested: true,
    }));
  }, []);

  const openEditEditor = useCallback((stop: StopResponse) => {
    const points = [...stop.points].sort((a, b) => a.sequence - b.sequence);

    setState((previousState) => ({
      ...previousState,
      panelMode: "editor",
      selectedStop: stop,
      selectedStopId: stop.id,
      editorMode: "editing",
      activeStopTool: points.length >= 2 ? "edit-line" : "draw-line",
      draft: buildDraftFromStop(stop),
      focusWaypoints: buildFocusWaypoints(stop),
      focusKey: `${stop.id}-${Date.now()}`,
      autoDrawRequested: points.length < 2,
    }));
  }, []);

  const closeEditor = useCallback(() => {
    setState((previousState) => {
      if (previousState.selectedStop) {
        return {
          ...previousState,
          panelMode: "details",
          editorMode: null,
          activeStopTool: "none",
          draft: null,
          autoDrawRequested: false,
        };
      }

      return {
        ...previousState,
        panelMode: "list",
        selectedStop: null,
        selectedStopId: null,
        editorMode: null,
        activeStopTool: "none",
        draft: null,
        focusWaypoints: undefined,
        focusKey: null,
        autoDrawRequested: false,
      };
    });
  }, []);

  const updateDraftName = useCallback((name: string) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          name,
        },
      };
    });
  }, []);

  const updateDraftRestrictionType = useCallback((restrictionType: StopRestrictionType) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          restrictionType,
          routeIds: restrictionType === "specific" ? previousState.draft.routeIds : [],
          vehicleTypeIds: restrictionType === "specific" ? previousState.draft.vehicleTypeIds : [],
        },
      };
    });
  }, []);

  const updateDraftDisallowedDirection = useCallback((disallowedDirection: StopDisallowedDirection) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          disallowedDirection,
        },
      };
    });
  }, []);

  const updateDraftRouteIds = useCallback((routeIds: string[]) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          routeIds,
        },
      };
    });
  }, []);

  const updateDraftVehicleTypeIds = useCallback((vehicleTypeIds: string[]) => {
    setState((previousState) => {
      if (!previousState.draft) {
        return previousState;
      }

      return {
        ...previousState,
        draft: {
          ...previousState.draft,
          vehicleTypeIds,
        },
      };
    });
  }, []);

  const updateDraftPoints = useCallback((points: Array<[number, number]>) => {
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

  const setActiveStopTool = useCallback((tool: ActiveStopTool) => {
    setState((previousState) => ({
      ...previousState,
      activeStopTool: tool,
    }));
  }, []);

  const finishStopToolEditing = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      activeStopTool: "none",
      autoDrawRequested: false,
    }));
  }, []);

  const consumeAutoDrawRequest = useCallback(() => {
    setState((previousState) => {
      if (!previousState.autoDrawRequested) {
        return previousState;
      }

      return {
        ...previousState,
        autoDrawRequested: false,
      };
    });
  }, []);

  const setSelectedStopPublicState = useCallback((isPublic: boolean) => {
    setState((previousState) => {
      if (!previousState.selectedStop) {
        return previousState;
      }

      return {
        ...previousState,
        selectedStop: {
          ...previousState.selectedStop,
          isPublic,
        },
      };
    });
  }, []);

  const syncSelectedStop = useCallback((stop: StopResponse | null) => {
    setState((previousState) => {
      if (!stop) {
        return {
          ...previousState,
          panelMode: "list",
          selectedStop: null,
          selectedStopId: null,
          editorMode: null,
          activeStopTool: "none",
          draft: null,
          focusWaypoints: undefined,
          focusKey: null,
          autoDrawRequested: false,
        };
      }

      const isEditingCurrent = previousState.editorMode === "editing" && previousState.selectedStopId === stop.id;

      return {
        ...previousState,
        selectedStop: stop,
        selectedStopId: stop.id,
        focusWaypoints: buildFocusWaypoints(stop),
        draft: isEditingCurrent ? buildDraftFromStop(stop) : previousState.draft,
      };
    });
  }, []);

  const value = useMemo<StopDashboardContextValue>(() => ({
    ...state,
    selectStop,
    clearSelection,
    openCreateEditor,
    openEditEditor,
    closeEditor,
    updateDraftName,
    updateDraftRestrictionType,
    updateDraftDisallowedDirection,
    updateDraftRouteIds,
    updateDraftVehicleTypeIds,
    updateDraftPoints,
    setActiveStopTool,
    finishStopToolEditing,
    consumeAutoDrawRequest,
    setSelectedStopPublicState,
    syncSelectedStop,
  }), [
    state,
    selectStop,
    clearSelection,
    openCreateEditor,
    openEditEditor,
    closeEditor,
    updateDraftName,
    updateDraftRestrictionType,
    updateDraftDisallowedDirection,
    updateDraftRouteIds,
    updateDraftVehicleTypeIds,
    updateDraftPoints,
    setActiveStopTool,
    finishStopToolEditing,
    consumeAutoDrawRequest,
    setSelectedStopPublicState,
    syncSelectedStop,
  ]);

  return (
    <StopDashboardContext.Provider value={value}>
      {children}
    </StopDashboardContext.Provider>
  );
}

export function useStopDashboard() {
  const context = useContext(StopDashboardContext);
  if (!context) {
    throw new Error("useStopDashboard must be used within a StopDashboardProvider");
  }

  return context;
}
