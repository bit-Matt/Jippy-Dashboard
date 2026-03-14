"use client";

import React, { createContext, useContext, useCallback, useState } from "react";

export interface Waypoint {
  id: number;
  lat: number;
  lng: number;
  color: string;
  sequence: number;
  address?: string;
}

export type RouteDirection = "goingTo" | "goingBack";

export interface RouteDirectionalWaypoints {
  goingTo: Waypoint[];
  goingBack: Waypoint[];
}

export interface RouteEditorContextType {
  // State
  isCreating: boolean;
  selectedColor: string;
  activeDirection: RouteDirection;
  waypointCounts: Record<RouteDirection, number>;
  waypoints: Waypoint[];
  activePointIndex: number | null;

  // Actions
  startCreating: () => void;
  startEditing: (payload: {
    color: string;
    points: {
      goingTo: Array<{ point: [number, number] }>;
      goingBack: Array<{ point: [number, number] }>;
    };
  }) => void;
  stopCreating: () => void;
  setSelectedColor: (color: string) => void;
  setActiveDirection: (direction: RouteDirection) => void;
  addWaypoint: (lat: number, lng: number) => void;
  removeWaypoint: (id: number) => void;
  reorderWaypoints: (draggedId: number, targetId: number) => void;
  updateWaypoint: (id: number, lat: number, lng: number) => void;
  clearWaypoints: () => void;
  clearAllWaypoints: () => void;
  setActivePointIndex: (index: number | null) => void;
  saveRoute: () => RouteDirectionalWaypoints | null;

  // Map integration
  mapInvokeCalls: {
    handleCreatePoint: ((fn: () => void) => void) | null;
    handleAddPoint: ((fn: () => [number, number]) => void) | null;
  };
  registerMapCallbacks: (
    handleCreatePoint: (fn: () => void) => void,
    handleAddPoint: (fn: () => [number, number]) => void
  ) => void;
}

const RouteEditorContext = createContext<RouteEditorContextType | undefined>(
  undefined,
);

export function RouteEditorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#fff100");
  const [activeDirection, setActiveDirection] = useState<RouteDirection>("goingTo");
  const [waypointsByDirection, setWaypointsByDirection] = useState<RouteDirectionalWaypoints>({
    goingTo: [],
    goingBack: [],
  });
  const [activePointByDirection, setActivePointByDirection] = useState<Record<RouteDirection, number | null>>({
    goingTo: null,
    goingBack: null,
  });
  const [waypointCounter, setWaypointCounter] = useState(0);

  const [mapCallbacks, setMapCallbacks] = useState<{
    handleCreatePoint: ((fn: () => void) => void) | null;
    handleAddPoint: ((fn: () => [number, number]) => void) | null;
      }>({
        handleCreatePoint: null,
        handleAddPoint: null,
      });

  const startCreating = useCallback(() => {
    setIsCreating(true);
    setActiveDirection("goingTo");
    setWaypointsByDirection({ goingTo: [], goingBack: [] });
    setWaypointCounter(0);
    setActivePointByDirection({ goingTo: null, goingBack: null });
  }, []);

  const startEditing = useCallback((payload: {
    color: string;
    points: {
      goingTo: Array<{ point: [number, number] }>;
      goingBack: Array<{ point: [number, number] }>;
    };
  }) => {
    const mappedGoingTo: Waypoint[] = payload.points.goingTo.map((point, index) => ({
      id: index,
      lat: point.point[0],
      lng: point.point[1],
      color: payload.color,
      sequence: index,
    }));

    const mappedGoingBack: Waypoint[] = payload.points.goingBack.map((point, index) => ({
      id: mappedGoingTo.length + index,
      lat: point.point[0],
      lng: point.point[1],
      color: payload.color,
      sequence: index,
    }));

    setIsCreating(true);
    setActiveDirection("goingTo");
    setSelectedColor(payload.color);
    setWaypointsByDirection({
      goingTo: mappedGoingTo,
      goingBack: mappedGoingBack,
    });
    setWaypointCounter(mappedGoingTo.length + mappedGoingBack.length);
    setActivePointByDirection({
      goingTo: mappedGoingTo.length > 0 ? mappedGoingTo[0].id : null,
      goingBack: mappedGoingBack.length > 0 ? mappedGoingBack[0].id : null,
    });
  }, []);

  const stopCreating = useCallback(() => {
    setIsCreating(false);
    setActiveDirection("goingTo");
    setWaypointsByDirection({ goingTo: [], goingBack: [] });
    setActivePointByDirection({ goingTo: null, goingBack: null });
    setWaypointCounter(0);
  }, []);

  const addWaypoint = useCallback(
    (lat: number, lng: number) => {
      const activeWaypoints = waypointsByDirection[activeDirection];
      const newWaypoint: Waypoint = {
        id: waypointCounter,
        lat,
        lng,
        color: selectedColor,
        sequence: activeWaypoints.length,
      };

      setWaypointsByDirection((prev) => ({
        ...prev,
        [activeDirection]: [...prev[activeDirection], newWaypoint],
      }));
      setWaypointCounter((prev) => prev + 1);
      setActivePointByDirection((prev) => ({
        ...prev,
        [activeDirection]: newWaypoint.id,
      }));
    },
    [activeDirection, selectedColor, waypointsByDirection, waypointCounter],
  );

  const removeWaypoint = useCallback((id: number) => {
    setWaypointsByDirection((prev) => {
      const filtered = prev[activeDirection].filter((wp) => wp.id !== id);

      return {
        ...prev,
        [activeDirection]: filtered.map((wp, index) => ({
          ...wp,
          sequence: index,
        })),
      };
    });

    setActivePointByDirection((prev) => ({
      ...prev,
      [activeDirection]: prev[activeDirection] === id ? null : prev[activeDirection],
    }));
  }, [activeDirection]);

  const reorderWaypoints = useCallback((draggedId: number, targetId: number) => {
    if (draggedId === targetId) return;

    setWaypointsByDirection((prev) => {
      const activeWaypoints = prev[activeDirection];
      const draggedIndex = activeWaypoints.findIndex((wp) => wp.id === draggedId);
      const targetIndex = activeWaypoints.findIndex((wp) => wp.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const next = [...activeWaypoints];
      const [draggedWaypoint] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedWaypoint);

      return {
        ...prev,
        [activeDirection]: next.map((wp, index) => ({
          ...wp,
          sequence: index,
        })),
      };
    });

    setActivePointByDirection((prev) => ({
      ...prev,
      [activeDirection]: draggedId,
    }));
  }, [activeDirection]);

  const updateWaypoint = useCallback((id: number, lat: number, lng: number) => {
    setWaypointsByDirection((prev) => ({
      ...prev,
      [activeDirection]: prev[activeDirection].map((wp) => (
        wp.id === id ? { ...wp, lat, lng } : wp
      )),
    }));
  }, [activeDirection]);

  const clearWaypoints = useCallback(() => {
    setWaypointsByDirection((prev) => ({
      ...prev,
      [activeDirection]: [],
    }));
    setActivePointByDirection((prev) => ({
      ...prev,
      [activeDirection]: null,
    }));
  }, [activeDirection]);

  const clearAllWaypoints = useCallback(() => {
    setWaypointsByDirection({ goingTo: [], goingBack: [] });
    setActivePointByDirection({ goingTo: null, goingBack: null });
    setWaypointCounter(0);
  }, []);

  const saveRoute = useCallback(() => {
    if (waypointsByDirection.goingTo.length < 2 || waypointsByDirection.goingBack.length < 2) {
      console.warn("Each direction must have at least 2 waypoints");
      return null;
    }

    return {
      goingTo: waypointsByDirection.goingTo,
      goingBack: waypointsByDirection.goingBack,
    };
  }, [waypointsByDirection]);

  const registerMapCallbacks = useCallback(
    (
      handleCreatePoint: (fn: () => void) => void,
      handleAddPoint: (fn: () => [number, number]) => void,
    ) => {
      setMapCallbacks({
        handleCreatePoint,
        handleAddPoint,
      });
    },
    [],
  );

  const activeWaypoints = waypointsByDirection[activeDirection];
  const waypointCounts = {
    goingTo: waypointsByDirection.goingTo.length,
    goingBack: waypointsByDirection.goingBack.length,
  };

  const value: RouteEditorContextType = {
    // State
    isCreating,
    selectedColor,
    activeDirection,
    waypointCounts,
    waypoints: activeWaypoints,
    activePointIndex: activePointByDirection[activeDirection],

    // Actions
    startCreating,
    startEditing,
    stopCreating,
    setSelectedColor,
    setActiveDirection,
    addWaypoint,
    removeWaypoint,
    reorderWaypoints,
    updateWaypoint,
    clearWaypoints,
    clearAllWaypoints,
    setActivePointIndex: (index) => {
      setActivePointByDirection((prev) => ({
        ...prev,
        [activeDirection]: index,
      }));
    },
    saveRoute,

    // Map integration
    mapInvokeCalls: mapCallbacks,
    registerMapCallbacks,
  };

  return (
    <RouteEditorContext.Provider value={value}>
      {children}
    </RouteEditorContext.Provider>
  );
}

export function useRouteEditor() {
  const context = useContext(RouteEditorContext);
  if (context === undefined) {
    throw new Error(
      "useRouteEditor must be used within a RouteEditorProvider",
    );
  }
  return context;
}
