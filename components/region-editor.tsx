"use client";

import { Check, ChevronLeft, PenTool, Pencil, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { z } from "zod";

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

const regionSaveSchema = z.object({
  hasDefinedPolygon: z.literal(true, {
    message: "A polygon or rectangle must be defined before saving.",
  }),
  stations: z.array(
    z.object({
      availableFrom: z.string().min(1),
      availableTo: z.string().min(1),
    }).refine((s) => s.availableFrom <= s.availableTo, {
      message: "Available From must be earlier than or equal to Available To.",
    }),
  ),
});

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
  const initialDraftRef = useRef<string>("");
  const initialDraftRegionIdRef = useRef<string | null | undefined>(undefined);

  const {
    editingRegionId,
    snapshotName,
    snapshotState,
    regionName,
    regionColor,
    regionShape,
    stations,
    activeStationId,
    editorPage,
    activeRegionTool,
    hasDefinedPolygon,
    setRegionName,
    setRegionColor,
    setActiveStationId,
    setEditorPage,
    setActiveRegionTool,
    finishRegionToolEditing,
    startAddingStation,
    stopAddingStation,
    updateStationAvailability,
    removeStation,
    saveRegionTemplate,
    closeRegionEditor,
    setSnapshotName,
    setSnapshotState,
  } = useRegionEditor();
  const { data: me } = useSWR<MeResponse>("/api/me", $fetch);
  const isAdministrator = me?.data?.data?.role === "administrator_user";
  const invalidStationIndexes = stations
    .map((station, index) => ({
      index,
      isInvalid: !station.availableFrom || !station.availableTo || station.availableFrom > station.availableTo,
    }))
    .filter((station) => station.isInvalid)
    .map((station) => station.index + 1);
  const hasInvalidStationAvailability = invalidStationIndexes.length > 0;

  useEffect(() => {
    if (initialDraftRegionIdRef.current === editingRegionId) return;
    initialDraftRegionIdRef.current = editingRegionId;

    initialDraftRef.current = JSON.stringify({
      editingRegionId,
      snapshotName,
      snapshotState,
      regionName,
      regionColor,
      regionShape,
      stations,
    });
  }, [editingRegionId, snapshotName, snapshotState, regionName, regionColor, regionShape, stations]);

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
    const parsed = regionSaveSchema.safeParse({
      hasDefinedPolygon,
      stations: stations.map((s) => ({
        availableFrom: s.availableFrom,
        availableTo: s.availableTo,
      })),
    });

    if (!parsed.success) {
      alert(parsed.error.issues.map((i) => i.message).join("\n"));
      return;
    }

    void saveRegionTemplate();
  };

  const handleCloseEditor = () => {
    const currentDraftState = JSON.stringify({
      editingRegionId,
      snapshotName,
      snapshotState,
      regionName,
      regionColor,
      regionShape,
      stations,
    });

    const isDirty = initialDraftRef.current !== "" && currentDraftState !== initialDraftRef.current;
    if (isDirty) {
      const shouldDiscard = window.confirm("You have unsaved region changes. Discard and go back?");
      if (!shouldDiscard) return;
    }

    closeRegionEditor();
  };

  const handleOpenStationEditor = () => {
    startAddingStation();
    setEditorPage("stations");
  };

  const handleCloseStationEditor = () => {
    stopAddingStation();
    setEditorPage("main");
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4 animate-in slide-in-from-left-6 duration-200">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 pt-1.5 pb-2">
          <div>
            <h2 className="text-base font-semibold">
              {editorPage === "stations" ? "Manage Stations" : editingRegionId ? "Edit Region" : "Add Region"}
            </h2>
            <Badge className="mt-1" variant={editingRegionId ? "default" : "secondary"}>
              {editingRegionId ? "Edit Mode" : "Create Mode"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveRegion}
              disabled={!hasDefinedPolygon || hasInvalidStationAvailability}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={editorPage === "stations" ? handleCloseStationEditor : handleCloseEditor}
              aria-label={editorPage === "stations" ? "Back from station manager" : "Back from region editor"}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[75vh] overflow-hidden p-1">
          <div
            className={`flex w-[200%] items-start transition-transform duration-300 ease-out ${
              editorPage === "stations" ? "-translate-x-1/2" : "translate-x-0"
            }`}
          >
            <div className="flex w-1/2 shrink-0 flex-col space-y-3 overflow-y-auto p-2">
              <div className="space-y-2">
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

              <div className="space-y-2">
                <Label>Stations</Label>
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={!hasDefinedPolygon}
                  onClick={handleOpenStationEditor}
                >
                  Manage Stations
                </Button>
              </div>

              <div className="space-y-2">
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
            </div>

            <div className="flex w-1/2 shrink-0 flex-col space-y-2 overflow-y-auto p-2">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Click any point on the map to place a station, as long as it is within the region.
                </p>

                <div className="space-y-2 pr-1 pb-1">
                  {stations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No stations yet. Click inside the region on the map to add one.
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
                      <div className="mt-2 grid grid-cols-2 gap-2" onClick={(event) => event.stopPropagation()}>
                        <div className="space-y-1">
                          <Label htmlFor={`station-${station.id}-from`} className="text-xs">Available From</Label>
                          <Input
                            id={`station-${station.id}-from`}
                            type="time"
                            value={station.availableFrom}
                            onChange={(event) => updateStationAvailability(station.id, "availableFrom", event.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`station-${station.id}-to`} className="text-xs">Available To</Label>
                          <Input
                            id={`station-${station.id}-to`}
                            type="time"
                            value={station.availableTo}
                            onChange={(event) => updateStationAvailability(station.id, "availableTo", event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {hasInvalidStationAvailability ? (
                  <p className="text-xs text-destructive">
                    Invalid availability in station point(s): {invalidStationIndexes.join(", ")}. Available From must be earlier than or equal to Available To.
                  </p>
                ) : null}
              </div>
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
