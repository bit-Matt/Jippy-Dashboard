"use client";

import { Check, PenTool, Pencil, Square, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRegionEditor } from "@/contexts/RegionEditorContext";
import { $fetch } from "@/lib/http/client";

import * as nominatim from "@/lib/osm/nominatim";

const REGION_COLORS = [
  { label: "Sun Yellow", value: "#fff100" },
  { label: "Orange", value: "#ff8c00" },
  { label: "Red", value: "#e81123" },
  { label: "Magenta", value: "#ec008c" },
  { label: "Purple", value: "#68217a" },
  { label: "Navy", value: "#00188f" },
  { label: "Sky", value: "#00bcf2" },
  { label: "Teal", value: "#00b294" },
  { label: "Green", value: "#009e49" },
  { label: "Lime", value: "#bad80a" },
];

export default function RegionEditor() {
  const [stationAddresses, setStationAddresses] = useState<Record<number, string>>({});
  const [stationAddressCoords, setStationAddressCoords] = useState<Record<number, string>>({});
  const [loadingAddresses, setLoadingAddresses] = useState<Set<number>>(new Set());

  const {
    editingRegionId,
    snapshotName,
    snapshotState,
    regionName,
    regionColor,
    stations,
    activeStationId,
    isAddingStation,
    activeRegionTool,
    hasDefinedPolygon,
    setRegionName,
    setRegionColor,
    setActiveStationId,
    setActiveRegionTool,
    finishRegionToolEditing,
    startAddingStation,
    stopAddingStation,
    removeStation,
    saveRegionTemplate,
    closeRegionEditor,
    setSnapshotName,
    setSnapshotState,
  } = useRegionEditor();
  const { data: me } = useSWR<MeResponse>("/api/me", $fetch);
  const isAdministrator = me?.data?.data?.role === "administrator_user";

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

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {editingRegionId ? "Edit Region" : "Add Region"}
            </h2>
            <Badge className="mt-1" variant={editingRegionId ? "default" : "secondary"}>
              {editingRegionId ? "Edit Mode" : "Create Mode"}
            </Badge>
          </div>
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
              <Label htmlFor="region-version-name">Version Name</Label>
              <Input
                id="region-version-name"
                placeholder="e.g., v1"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Snapshot State</Label>
              <Select
                value={snapshotState}
                onValueChange={(value) => setSnapshotState(value as "wip" | "for_approval" | "ready")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select snapshot state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wip">WIP</SelectItem>
                  <SelectItem value="for_approval">For Approval</SelectItem>
                  {isAdministrator ? <SelectItem value="ready">Ready</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
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
            <Select value={regionColor} onValueChange={setRegionColor}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select region color" />
              </SelectTrigger>
              <SelectContent>
                {REGION_COLORS.map((color) => (
                  <SelectItem key={color.value} value={color.value}>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: color.value }}
                      />
                      {color.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="space-y-3">
            <Label>Region Tools</Label>
            <div className="grid grid-cols-4 gap-2">
              <Button
                type="button"
                variant={activeRegionTool === "draw-polygon" ? "secondary" : "outline"}
                onClick={() => setActiveRegionTool("draw-polygon")}
                aria-label="Draw Polygon"
                title="Draw Polygon"
              >
                <PenTool className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={activeRegionTool === "draw-rectangle" ? "secondary" : "outline"}
                onClick={() => setActiveRegionTool("draw-rectangle")}
                aria-label="Draw Rectangle"
                title="Draw Rectangle"
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={activeRegionTool === "edit-region" ? "secondary" : "outline"}
                disabled={!hasDefinedPolygon}
                onClick={() => setActiveRegionTool("edit-region")}
                aria-label="Edit Region"
                title="Edit Region"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={finishRegionToolEditing}
                aria-label="Finish Editing"
                title="Finish Editing"
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

type MeResponse = {
  data: {
    ok: boolean;
    data: {
      role: string;
    };
  };
  error?: unknown;
}
