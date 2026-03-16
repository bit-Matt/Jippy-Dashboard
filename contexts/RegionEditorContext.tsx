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
    point: [number, number];
  }>;
}

export interface RegionStationDraft {
  id: number;
  lat: number;
  lng: number;
  address?: string;
}

interface RegionEditorContextType {
  showRegionEditor: boolean;
  editingRegionId: string | null;
  regionName: string;
  regionColor: string;
  regionShape: RegionDraftShape | null;
  stations: RegionStationDraft[];
  activeStationId: number | null;
  isAddingStation: boolean;
  hasDefinedPolygon: boolean;
  mutationVersion: number;

  openRegionEditor: () => void;
  openRegionEditorForEdit: (region: RegionSummary) => void;
  closeRegionEditor: () => void;
  setRegionName: (name: string) => void;
  setRegionColor: (color: string) => void;
  setRegionShape: (shape: RegionDraftShape | null) => void;
  setActiveStationId: (id: number | null) => void;
  startAddingStation: () => void;
  stopAddingStation: () => void;
  addStation: (lat: number, lng: number) => void;
  updateStation: (id: number, lat: number, lng: number) => void;
  removeStation: (id: number) => void;
  saveRegionTemplate: () => Promise<void>;
  deleteRegionTemplate: () => Promise<void>;
}

const RegionEditorContext = createContext<RegionEditorContextType | undefined>(undefined);

export function RegionEditorProvider({ children }: { children: React.ReactNode }) {
  const [showRegionEditor, setShowRegionEditor] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [regionName, setRegionName] = useState("");
  const [regionColor, setRegionColor] = useState("#fff100");
  const [regionShape, setRegionShape] = useState<RegionDraftShape | null>(null);
  const [stations, setStations] = useState<RegionStationDraft[]>([]);
  const [activeStationId, setActiveStationId] = useState<number | null>(null);
  const [stationCounter, setStationCounter] = useState(0);
  const [isAddingStation, setIsAddingStation] = useState(false);
  const [mutationVersion, setMutationVersion] = useState(0);

  const bumpMutationVersion = () => {
    setMutationVersion((prev) => prev + 1);
  };

  const openRegionEditor = () => {
    setShowRegionEditor(true);
    setEditingRegionId(null);
    setRegionName("");
    setRegionColor("#fff100");
    setRegionShape(null);
    setStations([]);
    setActiveStationId(null);
    setStationCounter(0);
    setIsAddingStation(false);
  };

  const openRegionEditorForEdit = (region: RegionSummary) => {
    setShowRegionEditor(true);
    setEditingRegionId(region.id);
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
    }));
    setStations(mappedStations);
    setActiveStationId(mappedStations.length > 0 ? mappedStations[0].id : null);
    setStationCounter(mappedStations.length);
    setIsAddingStation(false);
  };

  const closeRegionEditor = () => {
    setShowRegionEditor(false);
    setEditingRegionId(null);
    setRegionShape(null);
    setStations([]);
    setActiveStationId(null);
    setStationCounter(0);
    setIsAddingStation(false);
  };

  const handleSetRegionShape = useCallback((shape: RegionDraftShape | null) => {
    setRegionShape(shape);

    if (!shape) {
      setStations([]);
      setActiveStationId(null);
      setStationCounter(0);
      setIsAddingStation(false);
    }
  }, []);

  const startAddingStation = useCallback(() => {
    if (!regionShape) return;
    setIsAddingStation(true);
  }, [regionShape]);

  const stopAddingStation = useCallback(() => {
    setIsAddingStation(false);
  }, []);

  const addStation = useCallback((lat: number, lng: number) => {
    const newStation: RegionStationDraft = {
      id: stationCounter,
      lat,
      lng,
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
          point: [station.lat, station.lng] as [number, number],
        };
      }),
    );

    const payload = {
      regionName,
      regionColor,
      regionShape: regionShape.type,
      points: regionShape.coordinates.map((point, index) => ({
        sequence: index,
        point,
      })),
      stations: stationPayload,
    };

    const endpoint = editingRegionId
      ? `/api/restricted/management/region/${editingRegionId}`
      : "/api/restricted/management/region";
    const method = editingRegionId ? "PATCH" : "POST";

    const { error } = await $fetch(endpoint, {
      method,
      body: payload,
    });

    if (error) {
      console.error("Failed to save region:", error);
      return;
    }

    bumpMutationVersion();
    closeRegionEditor();
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
    regionName,
    regionColor,
    regionShape,
    stations,
    activeStationId,
    isAddingStation,
    hasDefinedPolygon: regionShape !== null,
    mutationVersion,
    openRegionEditor,
    openRegionEditorForEdit,
    closeRegionEditor,
    setRegionName,
    setRegionColor,
    setRegionShape: handleSetRegionShape,
    setActiveStationId,
    startAddingStation,
    stopAddingStation,
    addStation,
    updateStation,
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
