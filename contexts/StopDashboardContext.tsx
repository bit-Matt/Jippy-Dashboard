"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type {
  RestrictedBoardingZoneResponse,
  RbzDisallowedDirection,
  RbzRestrictionType,
  StopResponse,
} from "@/contracts/responses";
import { getRbzLineCoordinates } from "@/lib/stops/display";

export type DashboardTab = "stops" | "restricted-zones";
export type RbzEditorMode = "creating" | "editing";
export type ActiveRbzTool = "none" | "draw-line" | "edit-line";
export type DashboardPanelMode = "list" | "details" | "editor";

export interface RbzDraftPoint {
  id: string;
  sequence: number;
  point: [number, number];
}

interface RbzDraft {
  name: string;
  restrictionType: RbzRestrictionType;
  disallowedDirection: RbzDisallowedDirection;
  points: RbzDraftPoint[];
  routeIds: string[];
}

interface StopDashboardState {
  activeTab: DashboardTab;
  routeOverlayEnabled: boolean;
  selectedOverlayRouteIds: string[];

  selectedTransitStop: StopResponse | null;
  selectedTransitStopId: string | null;
  transitStopCreateMode: boolean;
  pendingCreatePoint: [number, number] | null;
  transitStopEditingPoint: [number, number] | null;

  panelMode: DashboardPanelMode;
  selectedRbz: RestrictedBoardingZoneResponse | null;
  selectedRbzId: string | null;
  rbzEditorMode: RbzEditorMode | null;
  activeRbzTool: ActiveRbzTool;
  rbzDraft: RbzDraft | null;
  focusWaypoints: Array<[number, number]> | undefined;
  focusKey: string | number | null;
  autoDrawRequested: boolean;
}

interface StopDashboardContextValue extends StopDashboardState {
  setActiveTab: (tab: DashboardTab) => void;
  setRouteOverlayEnabled: (enabled: boolean, allRouteIds?: string[]) => void;
  toggleOverlayRouteId: (routeId: string, checked: boolean) => void;

  selectTransitStopFromList: (stop: StopResponse) => void;
  selectTransitStopFromMap: (stop: StopResponse) => void;
  clearTransitStopSelection: () => void;
  openTransitStopCreateMode: () => void;
  cancelTransitStopCreateMode: () => void;
  setPendingCreatePoint: (point: [number, number] | null) => void;
  setTransitStopEditingPoint: (point: [number, number] | null) => void;
  syncSelectedTransitStop: (stop: StopResponse | null) => void;
  setSelectedTransitStopPublicState: (isPublic: boolean) => void;

  selectRbz: (zone: RestrictedBoardingZoneResponse) => void;
  clearRbzSelection: () => void;
  openCreateRbzEditor: () => void;
  openEditRbzEditor: (zone: RestrictedBoardingZoneResponse) => void;
  closeRbzEditor: () => void;
  updateRbzDraftName: (name: string) => void;
  updateRbzDraftRestrictionType: (restrictionType: RbzRestrictionType) => void;
  updateRbzDraftDisallowedDirection: (disallowedDirection: RbzDisallowedDirection) => void;
  updateRbzDraftRouteIds: (routeIds: string[]) => void;
  updateRbzDraftPoints: (points: Array<[number, number]>) => void;
  setActiveRbzTool: (tool: ActiveRbzTool) => void;
  finishRbzToolEditing: () => void;
  consumeAutoDrawRequest: () => void;
  setSelectedRbzPublicState: (isPublic: boolean) => void;
  syncSelectedRbz: (zone: RestrictedBoardingZoneResponse | null) => void;
}

const StopDashboardContext = createContext<StopDashboardContextValue | undefined>(undefined);

const buildRbzDraftFromZone = (zone: RestrictedBoardingZoneResponse): RbzDraft => ({
  name: zone.name,
  restrictionType: zone.restrictionType,
  disallowedDirection: zone.disallowedDirection,
  points: [...zone.points]
    .sort((a, b) => a.sequence - b.sequence)
    .map((point, index) => ({
      id: point.id || crypto.randomUUID(),
      sequence: index + 1,
      point: point.point,
    })),
  routeIds: [...zone.routeIds],
});

const buildRbzFocusWaypoints = (zone: RestrictedBoardingZoneResponse | null): Array<[number, number]> | undefined => {
  if (!zone) {
    return undefined;
  }

  const points = getRbzLineCoordinates(zone);
  return points.length > 0 ? points : undefined;
};

const buildEmptyRbzDraft = (): RbzDraft => ({
  name: "",
  restrictionType: "universal",
  disallowedDirection: "both",
  points: [],
  routeIds: [],
});

const buildTransitStopFocusWaypoints = (stop: StopResponse | null): Array<[number, number]> | undefined => {
  if (!stop?.point) {
    return undefined;
  }

  return [stop.point];
};

export function StopDashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StopDashboardState>({
    activeTab: "stops",
    routeOverlayEnabled: false,
    selectedOverlayRouteIds: [],

    selectedTransitStop: null,
    selectedTransitStopId: null,
    transitStopCreateMode: false,
    pendingCreatePoint: null,
    transitStopEditingPoint: null,

    panelMode: "list",
    selectedRbz: null,
    selectedRbzId: null,
    rbzEditorMode: null,
    activeRbzTool: "none",
    rbzDraft: null,
    focusWaypoints: undefined,
    focusKey: null,
    autoDrawRequested: false,
  });

  const setActiveTab = useCallback((tab: DashboardTab) => {
    setState((previousState) => ({
      ...previousState,
      activeTab: tab,
      transitStopCreateMode: false,
      pendingCreatePoint: null,
      transitStopEditingPoint: null,
      panelMode: tab === "restricted-zones" ? previousState.panelMode : "list",
      selectedRbz: tab === "stops" ? null : previousState.selectedRbz,
      selectedRbzId: tab === "stops" ? null : previousState.selectedRbzId,
      rbzEditorMode: tab === "stops" ? null : previousState.rbzEditorMode,
      activeRbzTool: tab === "stops" ? "none" : previousState.activeRbzTool,
      rbzDraft: tab === "stops" ? null : previousState.rbzDraft,
      selectedTransitStop: tab === "restricted-zones" ? null : previousState.selectedTransitStop,
      selectedTransitStopId: tab === "restricted-zones" ? null : previousState.selectedTransitStopId,
      focusWaypoints: tab === "stops"
        ? buildTransitStopFocusWaypoints(previousState.selectedTransitStop)
        : buildRbzFocusWaypoints(previousState.selectedRbz),
    }));
  }, []);

  const setRouteOverlayEnabled = useCallback((enabled: boolean, allRouteIds: string[] = []) => {
    setState((previousState) => ({
      ...previousState,
      routeOverlayEnabled: enabled,
      selectedOverlayRouteIds: enabled ? allRouteIds : [],
    }));
  }, []);

  const toggleOverlayRouteId = useCallback((routeId: string, checked: boolean) => {
    setState((previousState) => {
      const current = new Set(previousState.selectedOverlayRouteIds);
      if (checked) {
        current.add(routeId);
      } else {
        current.delete(routeId);
      }

      return {
        ...previousState,
        selectedOverlayRouteIds: [...current],
      };
    });
  }, []);

  const selectTransitStopFromList = useCallback((stop: StopResponse) => {
    setState((previousState) => ({
      ...previousState,
      selectedTransitStop: stop,
      selectedTransitStopId: stop.id,
      transitStopCreateMode: false,
      pendingCreatePoint: null,
      transitStopEditingPoint: !stop.isPublic && stop.point ? stop.point : null,
      focusWaypoints: buildTransitStopFocusWaypoints(stop),
      focusKey: `${stop.id}-${Date.now()}`,
    }));
  }, []);

  const selectTransitStopFromMap = useCallback((stop: StopResponse) => {
    setState((previousState) => ({
      ...previousState,
      selectedTransitStop: stop,
      selectedTransitStopId: stop.id,
      transitStopCreateMode: false,
      pendingCreatePoint: null,
      transitStopEditingPoint: !stop.isPublic && stop.point ? stop.point : null,
      focusWaypoints: undefined,
      focusKey: null,
    }));
  }, []);

  const clearTransitStopSelection = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      selectedTransitStop: null,
      selectedTransitStopId: null,
      transitStopEditingPoint: null,
      focusWaypoints: undefined,
      focusKey: null,
    }));
  }, []);

  const openTransitStopCreateMode = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      selectedTransitStop: null,
      selectedTransitStopId: null,
      transitStopCreateMode: true,
      pendingCreatePoint: null,
      transitStopEditingPoint: null,
      focusWaypoints: undefined,
      focusKey: null,
    }));
  }, []);

  const cancelTransitStopCreateMode = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      transitStopCreateMode: false,
      pendingCreatePoint: null,
    }));
  }, []);

  const setPendingCreatePoint = useCallback((point: [number, number] | null) => {
    setState((previousState) => ({
      ...previousState,
      pendingCreatePoint: point,
      ...(point !== null ? {
        selectedTransitStop: null,
        selectedTransitStopId: null,
        transitStopEditingPoint: null,
      } : {}),
    }));
  }, []);

  const setTransitStopEditingPoint = useCallback((point: [number, number] | null) => {
    setState((previousState) => ({
      ...previousState,
      transitStopEditingPoint: point,
    }));
  }, []);

  const syncSelectedTransitStop = useCallback((stop: StopResponse | null) => {
    setState((previousState) => {
      if (!stop) {
        return {
          ...previousState,
          selectedTransitStop: null,
          selectedTransitStopId: null,
          transitStopEditingPoint: null,
          focusWaypoints: undefined,
          focusKey: null,
        };
      }

      return {
        ...previousState,
        selectedTransitStop: stop,
        selectedTransitStopId: stop.id,
        transitStopEditingPoint: previousState.selectedTransitStopId === stop.id
          && previousState.transitStopEditingPoint
          && !stop.isPublic
          ? previousState.transitStopEditingPoint
          : (!stop.isPublic && stop.point ? stop.point : null),
        focusWaypoints: buildTransitStopFocusWaypoints(stop),
      };
    });
  }, []);

  const setSelectedTransitStopPublicState = useCallback((isPublic: boolean) => {
    setState((previousState) => {
      if (!previousState.selectedTransitStop) {
        return previousState;
      }

      return {
        ...previousState,
        selectedTransitStop: {
          ...previousState.selectedTransitStop,
          isPublic,
        },
      };
    });
  }, []);

  const selectRbz = useCallback((zone: RestrictedBoardingZoneResponse) => {
    setState((previousState) => ({
      ...previousState,
      panelMode: "details",
      selectedRbz: zone,
      selectedRbzId: zone.id,
      rbzEditorMode: null,
      activeRbzTool: "none",
      rbzDraft: null,
      focusWaypoints: buildRbzFocusWaypoints(zone),
      focusKey: `${zone.id}-${Date.now()}`,
      autoDrawRequested: false,
    }));
  }, []);

  const clearRbzSelection = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      panelMode: "list",
      selectedRbz: null,
      selectedRbzId: null,
      rbzEditorMode: null,
      activeRbzTool: "none",
      rbzDraft: null,
      focusWaypoints: undefined,
      focusKey: null,
      autoDrawRequested: false,
    }));
  }, []);

  const openCreateRbzEditor = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      panelMode: "editor",
      selectedRbz: null,
      selectedRbzId: null,
      rbzEditorMode: "creating",
      activeRbzTool: "draw-line",
      rbzDraft: buildEmptyRbzDraft(),
      focusWaypoints: undefined,
      focusKey: null,
      autoDrawRequested: true,
    }));
  }, []);

  const openEditRbzEditor = useCallback((zone: RestrictedBoardingZoneResponse) => {
    const points = [...zone.points].sort((a, b) => a.sequence - b.sequence);

    setState((previousState) => ({
      ...previousState,
      panelMode: "editor",
      selectedRbz: zone,
      selectedRbzId: zone.id,
      rbzEditorMode: "editing",
      activeRbzTool: points.length >= 2 ? "edit-line" : "draw-line",
      rbzDraft: buildRbzDraftFromZone(zone),
      focusWaypoints: buildRbzFocusWaypoints(zone),
      focusKey: `${zone.id}-${Date.now()}`,
      autoDrawRequested: points.length < 2,
    }));
  }, []);

  const closeRbzEditor = useCallback(() => {
    setState((previousState) => {
      if (previousState.selectedRbz) {
        return {
          ...previousState,
          panelMode: "details",
          rbzEditorMode: null,
          activeRbzTool: "none",
          rbzDraft: null,
          autoDrawRequested: false,
        };
      }

      return {
        ...previousState,
        panelMode: "list",
        selectedRbz: null,
        selectedRbzId: null,
        rbzEditorMode: null,
        activeRbzTool: "none",
        rbzDraft: null,
        focusWaypoints: undefined,
        focusKey: null,
        autoDrawRequested: false,
      };
    });
  }, []);

  const updateRbzDraftName = useCallback((name: string) => {
    setState((previousState) => {
      if (!previousState.rbzDraft) {
        return previousState;
      }

      return {
        ...previousState,
        rbzDraft: {
          ...previousState.rbzDraft,
          name,
        },
      };
    });
  }, []);

  const updateRbzDraftRestrictionType = useCallback((restrictionType: RbzRestrictionType) => {
    setState((previousState) => {
      if (!previousState.rbzDraft) {
        return previousState;
      }

      return {
        ...previousState,
        rbzDraft: {
          ...previousState.rbzDraft,
          restrictionType,
          routeIds: restrictionType === "specific" ? previousState.rbzDraft.routeIds : [],
        },
      };
    });
  }, []);

  const updateRbzDraftDisallowedDirection = useCallback((disallowedDirection: RbzDisallowedDirection) => {
    setState((previousState) => {
      if (!previousState.rbzDraft) {
        return previousState;
      }

      return {
        ...previousState,
        rbzDraft: {
          ...previousState.rbzDraft,
          disallowedDirection,
        },
      };
    });
  }, []);

  const updateRbzDraftRouteIds = useCallback((routeIds: string[]) => {
    setState((previousState) => {
      if (!previousState.rbzDraft) {
        return previousState;
      }

      return {
        ...previousState,
        rbzDraft: {
          ...previousState.rbzDraft,
          routeIds,
        },
      };
    });
  }, []);

  const updateRbzDraftPoints = useCallback((points: Array<[number, number]>) => {
    setState((previousState) => {
      if (!previousState.rbzDraft) {
        return previousState;
      }

      const normalizedPoints = points.map((point, index) => ({
        id: previousState.rbzDraft?.points[index]?.id ?? crypto.randomUUID(),
        sequence: index + 1,
        point,
      }));

      return {
        ...previousState,
        rbzDraft: {
          ...previousState.rbzDraft,
          points: normalizedPoints,
        },
      };
    });
  }, []);

  const setActiveRbzTool = useCallback((tool: ActiveRbzTool) => {
    setState((previousState) => ({
      ...previousState,
      activeRbzTool: tool,
    }));
  }, []);

  const finishRbzToolEditing = useCallback(() => {
    setState((previousState) => ({
      ...previousState,
      activeRbzTool: "none",
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

  const setSelectedRbzPublicState = useCallback((isPublic: boolean) => {
    setState((previousState) => {
      if (!previousState.selectedRbz) {
        return previousState;
      }

      return {
        ...previousState,
        selectedRbz: {
          ...previousState.selectedRbz,
          isPublic,
        },
      };
    });
  }, []);

  const syncSelectedRbz = useCallback((zone: RestrictedBoardingZoneResponse | null) => {
    setState((previousState) => {
      if (!zone) {
        return {
          ...previousState,
          panelMode: "list",
          selectedRbz: null,
          selectedRbzId: null,
          rbzEditorMode: null,
          activeRbzTool: "none",
          rbzDraft: null,
          focusWaypoints: undefined,
          focusKey: null,
          autoDrawRequested: false,
        };
      }

      const isEditingCurrent = previousState.rbzEditorMode === "editing" && previousState.selectedRbzId === zone.id;

      return {
        ...previousState,
        selectedRbz: zone,
        selectedRbzId: zone.id,
        focusWaypoints: buildRbzFocusWaypoints(zone),
        rbzDraft: isEditingCurrent ? buildRbzDraftFromZone(zone) : previousState.rbzDraft,
      };
    });
  }, []);

  const value = useMemo<StopDashboardContextValue>(() => ({
    ...state,
    setActiveTab,
    setRouteOverlayEnabled,
    toggleOverlayRouteId,
    selectTransitStopFromList,
    selectTransitStopFromMap,
    clearTransitStopSelection,
    openTransitStopCreateMode,
    cancelTransitStopCreateMode,
    setPendingCreatePoint,
    setTransitStopEditingPoint,
    syncSelectedTransitStop,
    setSelectedTransitStopPublicState,
    selectRbz,
    clearRbzSelection,
    openCreateRbzEditor,
    openEditRbzEditor,
    closeRbzEditor,
    updateRbzDraftName,
    updateRbzDraftRestrictionType,
    updateRbzDraftDisallowedDirection,
    updateRbzDraftRouteIds,
    updateRbzDraftPoints,
    setActiveRbzTool,
    finishRbzToolEditing,
    consumeAutoDrawRequest,
    setSelectedRbzPublicState,
    syncSelectedRbz,
  }), [
    state,
    setActiveTab,
    setRouteOverlayEnabled,
    toggleOverlayRouteId,
    selectTransitStopFromList,
    selectTransitStopFromMap,
    clearTransitStopSelection,
    openTransitStopCreateMode,
    cancelTransitStopCreateMode,
    setPendingCreatePoint,
    setTransitStopEditingPoint,
    syncSelectedTransitStop,
    setSelectedTransitStopPublicState,
    selectRbz,
    clearRbzSelection,
    openCreateRbzEditor,
    openEditRbzEditor,
    closeRbzEditor,
    updateRbzDraftName,
    updateRbzDraftRestrictionType,
    updateRbzDraftDisallowedDirection,
    updateRbzDraftRouteIds,
    updateRbzDraftPoints,
    setActiveRbzTool,
    finishRbzToolEditing,
    consumeAutoDrawRequest,
    setSelectedRbzPublicState,
    syncSelectedRbz,
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
