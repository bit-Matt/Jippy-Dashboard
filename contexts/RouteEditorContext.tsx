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

export interface RouteEditorContextType {
  // State
  isCreating: boolean;
  selectedColor: string;
  waypoints: Waypoint[];
  activePointIndex: number | null;

  // Actions
  startCreating: () => void;
  startEditing: (payload: { color: string; points: Array<{ point: [number, number] }> }) => void;
  stopCreating: () => void;
  setSelectedColor: (color: string) => void;
  addWaypoint: (lat: number, lng: number) => void;
  removeWaypoint: (id: number) => void;
  reorderWaypoints: (draggedId: number, targetId: number) => void;
  updateWaypoint: (id: number, lat: number, lng: number) => void;
  clearWaypoints: () => void;
  setActivePointIndex: (index: number | null) => void;
  saveRoute: () => Waypoint[] | null;

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
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
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
    setWaypoints([]);
    setWaypointCounter(0);
    setActivePointIndex(null);
  }, []);

  const startEditing = useCallback((payload: { color: string; points: Array<{ point: [number, number] }> }) => {
    const sortedPoints = [...payload.points];

    const mappedWaypoints: Waypoint[] = sortedPoints.map((point, index) => ({
      id: index,
      lat: point.point[0],
      lng: point.point[1],
      color: payload.color,
      sequence: index,
    }));

    setIsCreating(true);
    setSelectedColor(payload.color);
    setWaypoints(mappedWaypoints);
    setWaypointCounter(mappedWaypoints.length);
    setActivePointIndex(mappedWaypoints.length > 0 ? mappedWaypoints[0].id : null);
  }, []);

  const stopCreating = useCallback(() => {
    setIsCreating(false);
    setWaypoints([]);
    setActivePointIndex(null);
  }, []);

  const addWaypoint = useCallback(
    (lat: number, lng: number) => {
      const newWaypoint: Waypoint = {
        id: waypointCounter,
        lat,
        lng,
        color: selectedColor,
        sequence: waypoints.length,
      };
      setWaypoints((prev) => [...prev, newWaypoint]);
      setWaypointCounter((prev) => prev + 1);
      setActivePointIndex(newWaypoint.id);
    },
    [selectedColor, waypoints.length, waypointCounter],
  );

  const removeWaypoint = useCallback((id: number) => {
    setWaypoints((prev) => {
      const filtered = prev.filter((wp) => wp.id !== id);
      // Update sequence numbers
      return filtered.map((wp, index) => ({
        ...wp,
        sequence: index,
      }));
    });

    setActivePointIndex((prev) => (prev === id ? null : prev));
  }, []);

  const reorderWaypoints = useCallback((draggedId: number, targetId: number) => {
    if (draggedId === targetId) return;

    setWaypoints((prev) => {
      const draggedIndex = prev.findIndex((wp) => wp.id === draggedId);
      const targetIndex = prev.findIndex((wp) => wp.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      const [draggedWaypoint] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedWaypoint);

      return next.map((wp, index) => ({
        ...wp,
        sequence: index,
      }));
    });

    setActivePointIndex(draggedId);
  }, []);

  const updateWaypoint = useCallback((id: number, lat: number, lng: number) => {
    setWaypoints((prev) =>
      prev.map((wp) =>
        wp.id === id ? { ...wp, lat, lng } : wp,
      ),
    );
  }, []);

  const clearWaypoints = useCallback(() => {
    setWaypoints([]);
    setActivePointIndex(null);
  }, []);

  const saveRoute = useCallback(() => {
    if (waypoints.length < 2) {
      console.warn("Route must have at least 2 waypoints");
      return null;
    }
    // Return the waypoints array and let the parent handle saving
    return waypoints;
  }, [waypoints]);

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

  const value: RouteEditorContextType = {
    // State
    isCreating,
    selectedColor,
    waypoints,
    activePointIndex,

    // Actions
    startCreating,
    startEditing,
    stopCreating,
    setSelectedColor,
    addWaypoint,
    removeWaypoint,
    reorderWaypoints,
    updateWaypoint,
    clearWaypoints,
    setActivePointIndex,
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
