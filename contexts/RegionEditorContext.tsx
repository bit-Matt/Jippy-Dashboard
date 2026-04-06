"use client";

import { createContext, useContext, useCallback, useState } from "react";
import { $fetch } from "@/lib/http/client";
import * as nominatim from "@/lib/osm/nominatim";

export interface RegionDraftShape {
  type: "Polygon" | "Rectangle";
  coordinates: Array<[number, number]>;
}

export interface RegionSummary {
  id: string;
  activeSnapshotId: string;
  snapshotName: string;
  snapshotState: string;
  regionName: string;
  regionColor: string;
  regionShape: string;
  points: Array<{
    id: string;
    sequence: number;
    point: [number, number];
  }>;
  stations: Array<{
    id: string;
    address: string;
    availableFrom: string;
    availableTo: string;
    point: [number, number];
  }>;
}

export interface RegionStationDraft {
  id: number;
  lat: number;
  lng: number;
  address?: string;
  availableFrom: string;
  availableTo: string;
}

export type ActiveRegionTool = "none" | "draw-polygon" | "draw-rectangle" | "edit-region";

const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    const errorRecord = error as {
      message?: unknown;
      title?: unknown;
      details?: { message?: unknown } | unknown;
    };

    if (typeof errorRecord.message === "string" && errorRecord.message.trim().length > 0) {
      return errorRecord.message;
    }

    if (
      errorRecord.details &&
      typeof errorRecord.details === "object" &&
      "message" in errorRecord.details &&
      typeof errorRecord.details.message === "string" &&
      errorRecord.details.message.trim().length > 0
    ) {
      return errorRecord.details.message;
    }

    if (typeof errorRecord.title === "string" && errorRecord.title.trim().length > 0) {
      return errorRecord.title;
    }
  }

  return fallbackMessage;
};

interface RegionEditorContextType {
  showRegionEditor: boolean;
  editingRegionId: string | null;
  editingSnapshotId: string | null;
  snapshotName: string;
  snapshotState: "wip" | "for_approval" | "ready";
  regionName: string;
  regionColor: string;
  regionShape: RegionDraftShape | null;
  stations: RegionStationDraft[];
  activeStationId: number | null;
  isAddingStation: boolean;
  activeRegionTool: ActiveRegionTool;
  hasDefinedPolygon: boolean;
  mutationVersion: number;

  openRegionEditor: () => void;
  openRegionSnapshotEditor: (regionId: string) => void;
  openRegionEditorForEdit: (region: RegionSummary) => void;
  closeRegionEditor: () => void;
  setSnapshotName: (name: string) => void;
  setSnapshotState: (state: "wip" | "for_approval" | "ready") => void;
  setRegionName: (name: string) => void;
  setRegionColor: (color: string) => void;
  setRegionShape: (shape: RegionDraftShape | null) => void;
  setActiveStationId: (id: number | null) => void;
  setActiveRegionTool: (tool: ActiveRegionTool) => void;
  finishRegionToolEditing: () => void;
  startAddingStation: () => void;
  stopAddingStation: () => void;
  addStation: (lat: number, lng: number) => void;
  updateStation: (id: number, lat: number, lng: number) => void;
  updateStationAvailability: (id: number, field: "availableFrom" | "availableTo", value: string) => void;
  removeStation: (id: number) => void;
  saveRegionTemplate: () => Promise<void>;
  deleteRegionTemplate: () => Promise<void>;
}

const RegionEditorContext = createContext<RegionEditorContextType | undefined>(undefined);

export function RegionEditorProvider({ children }: { children: React.ReactNode }) {
  const [showRegionEditor, setShowRegionEditor] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState("v1");
  const [snapshotState, setSnapshotState] = useState<"wip" | "for_approval" | "ready">("wip");
  const [regionName, setRegionName] = useState("");
  const [regionColor, setRegionColor] = useState("#fff100");
  const [regionShape, setRegionShape] = useState<RegionDraftShape | null>(null);
  const [stations, setStations] = useState<RegionStationDraft[]>([]);
  const [activeStationId, setActiveStationId] = useState<number | null>(null);
  const [stationCounter, setStationCounter] = useState(0);
  const [isAddingStation, setIsAddingStation] = useState(false);
  const [activeRegionTool, setActiveRegionToolState] = useState<ActiveRegionTool>("none");
  const [mutationVersion, setMutationVersion] = useState(0);

  const bumpMutationVersion = () => {
    setMutationVersion((prev) => prev + 1);
  };

  const openRegionEditor = () => {
    setShowRegionEditor(true);
    setEditingRegionId(null);
    setEditingSnapshotId(null);
    setSnapshotName("v1");
    setSnapshotState("wip");
    setRegionName("");
    setRegionColor("#fff100");
    setRegionShape(null);
    setStations([]);
    setActiveStationId(null);
    setStationCounter(0);
    setIsAddingStation(false);
    setActiveRegionToolState("none");
  };

  const openRegionSnapshotEditor = (regionId: string) => {
    setShowRegionEditor(true);
    setEditingRegionId(regionId);
    setEditingSnapshotId(null);
    setSnapshotName("v1");
    setSnapshotState("wip");
    setRegionName("");
    setRegionColor("#fff100");
    setRegionShape(null);
    setStations([]);
    setActiveStationId(null);
    setStationCounter(0);
    setIsAddingStation(false);
    setActiveRegionToolState("none");
  };

  const openRegionEditorForEdit = (region: RegionSummary) => {
    setShowRegionEditor(true);
    setEditingRegionId(region.id);
    setEditingSnapshotId(region.activeSnapshotId);
    setSnapshotName(region.snapshotName ?? "Draft");
    setSnapshotState((region.snapshotState as "wip" | "for_approval" | "ready") ?? "wip");
    setRegionName(region.regionName);
    setRegionColor(region.regionColor);

    const sortedPoints = [...region.points]
      .sort((a, b) => a.sequence - b.sequence)
      .map((point) => point.point);

    setRegionShape({
      type: region.regionShape === "Rectangle" ? "Rectangle" : "Polygon",
      coordinates: sortedPoints,
    });

    const mappedStations: RegionStationDraft[] = region.stations.map((station, index) => ({
      id: index,
      lat: station.point[0],
      lng: station.point[1],
      address: station.address,
      availableFrom: station.availableFrom ?? "00:00",
      availableTo: station.availableTo ?? "23:59",
    }));
    setStations(mappedStations);
    setActiveStationId(mappedStations.length > 0 ? mappedStations[0].id : null);
    setStationCounter(mappedStations.length);
    setIsAddingStation(false);
    setActiveRegionToolState("none");
  };

  const closeRegionEditor = () => {
    setShowRegionEditor(false);
    setEditingRegionId(null);
    setEditingSnapshotId(null);
    setSnapshotName("v1");
    setSnapshotState("wip");
    setRegionShape(null);
    setStations([]);
    setActiveStationId(null);
    setStationCounter(0);
    setIsAddingStation(false);
    setActiveRegionToolState("none");
  };

  const handleSetRegionShape = useCallback((shape: RegionDraftShape | null) => {
    setRegionShape(shape);

    if (!shape) {
      setStations([]);
      setActiveStationId(null);
      setStationCounter(0);
      setIsAddingStation(false);
      setActiveRegionToolState("none");
    }
  }, []);

  const setActiveRegionTool = useCallback((tool: ActiveRegionTool) => {
    setActiveRegionToolState(tool);
    setIsAddingStation(false);
  }, []);

  const finishRegionToolEditing = useCallback(() => {
    setActiveRegionToolState("none");
  }, []);

  const startAddingStation = useCallback(() => {
    if (!regionShape) return;
    setIsAddingStation(true);
    setActiveRegionToolState("none");
  }, [regionShape]);

  const stopAddingStation = useCallback(() => {
    setIsAddingStation(false);
  }, []);

  const addStation = useCallback((lat: number, lng: number) => {
    const newStation: RegionStationDraft = {
      id: stationCounter,
      lat,
      lng,
      availableFrom: "00:00",
      availableTo: "23:59",
    };

    setStations((prev) => [...prev, newStation]);
    setStationCounter((prev) => prev + 1);
    setActiveStationId(newStation.id);
    setIsAddingStation(false);
  }, [stationCounter]);

  const updateStation = useCallback((id: number, lat: number, lng: number) => {
    setStations((prev) => prev.map((station) => (
      station.id === id ? { ...station, lat, lng, address: undefined } : station
    )));
  }, []);

  const updateStationAvailability = useCallback((id: number, field: "availableFrom" | "availableTo", value: string) => {
    setStations((prev) => prev.map((station) => (
      station.id === id ? { ...station, [field]: value } : station
    )));
  }, []);

  const removeStation = useCallback((id: number) => {
    setStations((prev) => prev.filter((station) => station.id !== id));
    setActiveStationId((prev) => (prev === id ? null : prev));
  }, []);

  const saveRegionTemplate = async () => {
    if (!regionShape) {
      console.warn("A polygon or rectangle must be defined before saving.");
      return;
    }

    const stationPayload = await Promise.all(
      stations.map(async (station) => {
        if (station.address) {
          return {
            address: station.address,
            availableFrom: station.availableFrom,
            availableTo: station.availableTo,
            point: [station.lat, station.lng] as [number, number],
          };
        }

        const { data, error } = await nominatim.reverse(
          {
            lat: station.lat,
            lon: station.lng,
            zoom: 18,
          },
        );

        const address = error || !data?.display_name
          ? "Unknown Address"
          : data.display_name;

        return {
          address,
          availableFrom: station.availableFrom,
          availableTo: station.availableTo,
          point: [station.lat, station.lng] as [number, number],
        };
      }),
    );

    const payload = {
      snapshotName,
      snapshotState,
      regionName,
      regionColor,
      regionShape: regionShape.type,
      points: regionShape.coordinates.map((point, index) => ({
        sequence: index,
        point,
      })),
      stations: stationPayload,
    };

    const isSnapshotEdit = !!editingRegionId && !!editingSnapshotId;
    const isSnapshotCreate = !!editingRegionId && !editingSnapshotId;
    const endpoint = isSnapshotEdit
      ? `/api/restricted/management/region/${editingRegionId}/${editingSnapshotId}`
      : isSnapshotCreate
        ? `/api/restricted/management/region/${editingRegionId}`
        : "/api/restricted/management/region";
    const method = isSnapshotEdit ? "PATCH" : "POST";

    try {
      const { error } = await $fetch(endpoint, {
        method,
        body: payload,
      });

      if (error) {
        console.error("Failed to save region:", error);
        alert(getErrorMessage(error, editingRegionId ? "Failed to update region." : "Failed to create region."));
        return;
      }

      bumpMutationVersion();
      closeRegionEditor();
    } catch (error) {
      console.error("Failed to save region:", error);
      alert(getErrorMessage(error, editingRegionId ? "Failed to update region." : "Failed to create region."));
    }
  };

  const deleteRegionTemplate = async () => {
    if (!editingRegionId) return;

    const shouldDelete = window.confirm("Are you sure you want to delete this region?");
    if (!shouldDelete) return;

    const { error } = await $fetch(`/api/restricted/management/region/${editingRegionId}`, {
      method: "DELETE",
    });

    if (error) {
      console.error("Failed to delete region:", error);
      return;
    }

    bumpMutationVersion();
    closeRegionEditor();
  };

  const value: RegionEditorContextType = {
    showRegionEditor,
    editingRegionId,
    editingSnapshotId,
    snapshotName,
    snapshotState,
    regionName,
    regionColor,
    regionShape,
    stations,
    activeStationId,
    isAddingStation,
    activeRegionTool,
    hasDefinedPolygon: regionShape !== null,
    mutationVersion,
    openRegionEditor,
    openRegionSnapshotEditor,
    openRegionEditorForEdit,
    closeRegionEditor,
    setSnapshotName,
    setSnapshotState,
    setRegionName,
    setRegionColor,
    setRegionShape: handleSetRegionShape,
    setActiveStationId,
    setActiveRegionTool,
    finishRegionToolEditing,
    startAddingStation,
    stopAddingStation,
    addStation,
    updateStation,
    updateStationAvailability,
    removeStation,
    saveRegionTemplate,
    deleteRegionTemplate,
  };

  return (
    <RegionEditorContext.Provider value={value}>
      {children}
    </RegionEditorContext.Provider>
  );
}

export function useRegionEditor() {
  const context = useContext(RegionEditorContext);
  if (!context) {
    throw new Error("useRegionEditor must be used within a RegionEditorProvider");
  }

  return context;
}
