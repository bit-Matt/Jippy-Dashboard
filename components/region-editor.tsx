"use client";

import { Check, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegionEditor } from "@/contexts/RegionEditorContext";

import * as nominatim from "@/lib/osm/nominatim";

const COLORS = [
  "#fff100", "#ff8c00", "#e81123",
  "#ec008c", "#68217a", "#00188f",
  "#00bcf2", "#00b294", "#009e49",
  "#bad80a",
];

export default function RegionEditor() {
  const [stationAddresses, setStationAddresses] = useState<Record<number, string>>({});
  const [stationAddressCoords, setStationAddressCoords] = useState<Record<number, string>>({});
  const [loadingAddresses, setLoadingAddresses] = useState<Set<number>>(new Set());

  const {
    editingRegionId,
    regionName,
    regionColor,
    stations,
    activeStationId,
    isAddingStation,
    hasDefinedPolygon,
    setRegionName,
    setRegionColor,
    setActiveStationId,
    startAddingStation,
    stopAddingStation,
    removeStation,
    saveRegionTemplate,
    deleteRegionTemplate,
    closeRegionEditor,
  } = useRegionEditor();

  useEffect(() => {
    const initialAddresses: Record<number, string> = {};
    const initialAddressCoords: Record<number, string> = {};

    stations.forEach((station) => {
      if (station.address) {
        initialAddresses[station.id] = station.address;
        initialAddressCoords[station.id] = `${station.lat},${station.lng}`;
      }
    });

    const timerId = window.setTimeout(() => {
      setStationAddresses(initialAddresses);
      setStationAddressCoords(initialAddressCoords);
      setLoadingAddresses(new Set());
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [editingRegionId, stations]);

  useEffect(() => {
    const geocodeStations = async () => {
      const toGeocode = stations.filter((station) => {
        const coordinateKey = `${station.lat},${station.lng}`;
        return stationAddressCoords[station.id] !== coordinateKey && !loadingAddresses.has(station.id);
      });

      if (toGeocode.length === 0) return;

      setLoadingAddresses((prev) => {
        const next = new Set(prev);
        toGeocode.forEach((station) => next.add(station.id));
        return next;
      });

      const nextAddresses: Record<number, string> = { ...stationAddresses };
      const nextCoords: Record<number, string> = { ...stationAddressCoords };

      for (const station of toGeocode) {
        const { data, error } = await nominatim.reverse(
          {
            lat: station.lat,
            lon: station.lng,
            zoom: 18,
          },
        );

        nextAddresses[station.id] = error || !data?.display_name
          ? "Unable to fetch address"
          : data.display_name;
        nextCoords[station.id] = `${station.lat},${station.lng}`;
      }

      setStationAddresses(nextAddresses);
      setStationAddressCoords(nextCoords);
      setLoadingAddresses((prev) => {
        const next = new Set(prev);
        toGeocode.forEach((station) => next.delete(station.id));
        return next;
      });
    };

    void geocodeStations();
  }, [stations, stationAddressCoords, stationAddresses, loadingAddresses]);

  const handleSaveRegion = () => {
    if (!hasDefinedPolygon) {
      console.warn("A polygon or rectangle must be defined before saving.");
      return;
    }

    void saveRegionTemplate();
  };

  const handleDeleteRegion = () => {
    void deleteRegionTemplate();
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-base font-semibold">
            {editingRegionId ? "Edit Region" : "Add Region"}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveRegion}
              disabled={!hasDefinedPolygon}
            >
              Save
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={closeRegionEditor}
              aria-label="Close region editor"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="region-name">Region Name</Label>
              <Input
                id="region-name"
                placeholder="e.g., Downtown Service Area"
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Region Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setRegionColor(color)}
                  className="relative h-10 w-10 rounded-full border-2 transition-transform hover:scale-105"
                  style={{
                    backgroundColor: color,
                    borderColor: regionColor === color ? "#111827" : "#e5e7eb",
                  }}
                >
                  {regionColor === color && (
                    <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-lg" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Stations</Label>
              <Button
                size="sm"
                variant={isAddingStation ? "secondary" : "outline"}
                disabled={!hasDefinedPolygon}
                onClick={isAddingStation ? stopAddingStation : startAddingStation}
              >
                {isAddingStation ? "Cancel Pin" : "Pin Station"}
              </Button>
            </div>

            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {stations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No stations yet. Click Pin Station, then click inside the region on the map.
                </p>
              ) : stations.map((station, position) => (
                <div
                  key={station.id}
                  className={`rounded-lg border bg-background p-3 ${
                    activeStationId === station.id ? "border-primary" : "border-border"
                  }`}
                  onClick={() => setActiveStationId(station.id)}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Station Point {position + 1}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeStation(station.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    readOnly
                    value={stationAddresses[station.id] ?? (loadingAddresses.has(station.id) ? "Loading address..." : "Resolving address...")}
                    title={stationAddresses[station.id]}
                  />
                </div>
              ))}
            </div>
          </div>

          {editingRegionId ? (
            <Button
              className="w-full"
              variant="destructive"
              onClick={handleDeleteRegion}
            >
              Delete Region
            </Button>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Draw a polygon or rectangle on the map to enable save. Region name is shown on the map near the center after shape creation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
