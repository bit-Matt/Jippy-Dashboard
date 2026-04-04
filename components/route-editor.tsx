"use client";

import { MapPin, Trash2, X } from "lucide-react";
import { useState, useEffect, useRef, type DragEvent } from "react";
import useSWR from "swr";

import { Card, CardContent, CardHeader} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { $fetch } from "@/lib/http/client";
import * as nominatim from "@/lib/osm/nominatim";
import type { AllResponse } from "@/components/app-sidebar";
import { useRouteEditor } from "@/contexts/RouteEditorContext";

const ROUTE_COLORS = [
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

export default function RouteEditor({ editingRoute, snapshotParentRouteId, onSaved, onClosed }: RouteEditorProps) {
  const [snapshotName, setSnapshotName] = useState("v1");
  const [snapshotState, setSnapshotState] = useState<"wip" | "for_approval" | "ready">("wip");
  const [routeNumber, setRouteNumber] = useState("");
  const [routeName, setRouteName] = useState("");
  const [routeDetails, setRouteDetails] = useState("");
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [draftRouteDetails, setDraftRouteDetails] = useState("");
  const [draggedWaypointId, setDraggedWaypointId] = useState<number | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState<Set<number>>(new Set());
  const { data: me } = useSWR<MeResponse>("/api/me", $fetch);
  const {
    selectedColor,
    activeDirection,
    waypointCounts,
    setSelectedColor,
    setActiveDirection,
    waypoints,
    activePointIndex,
    setActivePointIndex,
    removeWaypoint,
    reorderWaypoints,
    updateWaypoint,
    clearWaypoints,
    clearAllWaypoints,
    saveRoute,
    stopCreating,
  } = useRouteEditor();

  useEffect(() => {
    if (!editingRoute) {
      setSnapshotName("v1");
      setSnapshotState("wip");
      setRouteNumber("");
      setRouteName("");
      setRouteDetails("");
      return;
    }

    setSnapshotName(editingRoute.snapshotName ?? "Draft");
    setSnapshotState((editingRoute.snapshotState as "wip" | "for_approval" | "ready") ?? "wip");
    setRouteNumber(editingRoute.routeNumber);
    setRouteName(editingRoute.routeName);
    setRouteDetails(editingRoute.routeDetails ?? "");
  }, [editingRoute]);

  // Reverse geocode waypoints to get addresses
  useEffect(() => {
    const geocodeWaypoints = async () => {
      const toGeocode: typeof waypoints = [];

      // Find waypoints that don't have valid addresses yet
      waypoints.forEach((waypoint) => {
        // Skip if waypoint already has a valid address (and it's not "Unknown Address")
        if (waypoint.address && waypoint.address !== "Unknown Address") {
          return;
        }

        // Skip if already loading
        if (loadingAddresses.has(waypoint.id)) {
          return;
        }

        toGeocode.push(waypoint);
      });

      if (toGeocode.length === 0) return;

      setLoadingAddresses((prev) => {
        const updated = new Set(prev);
        toGeocode.forEach((wp) => updated.add(wp.id));
        return updated;
      });

      // Geocode each waypoint
      for (const waypoint of toGeocode) {
        const { data, error } = await nominatim.reverse(
          {
            lat: waypoint.lat,
            lon: waypoint.lng,
            zoom: 18,
          },
        );

        let address = "Unknown location";
        if (data) {
          address = data.display_name || "Unknown location";
        } else if (error) {
          address = "Unable to fetch address";
          console.error("Geocoding error:", error);
        }

        // Update waypoint with the fetched address
        updateWaypoint(waypoint.id, waypoint.lat, waypoint.lng, address);
      }

      setLoadingAddresses((prev) => {
        const updated = new Set(prev);
        toGeocode.forEach((wp) => updated.delete(wp.id));
        return updated;
      });
    };

    geocodeWaypoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  const handleSaveRoute = async () => {
    if (!routeNumber.trim() || !routeName.trim()) {
      console.warn("Route number and name are required");
      return;
    }

    const route = saveRoute();
    if (!route) {
      return;
    }

    const isSnapshotEdit = !!editingRoute?.id && !!editingRoute?.activeSnapshotId;
    const isSnapshotCreate = !isSnapshotEdit && !!snapshotParentRouteId;
    const endpoint = isSnapshotEdit
      ? `/api/restricted/management/route/${editingRoute.id}/${editingRoute.activeSnapshotId}`
      : isSnapshotCreate
        ? `/api/restricted/management/route/${snapshotParentRouteId}`
        : "/api/restricted/management/route";

    const method = isSnapshotEdit ? "PATCH" : "POST";
    const fallbackMessage = isSnapshotEdit
      ? "Failed to update route snapshot."
      : isSnapshotCreate
        ? "Failed to create route snapshot."
        : "Failed to create route.";

    try {
      const { error } = await $fetch(endpoint, {
        method,
        body: {
          snapshotName,
          snapshotState,
          routeNumber: routeNumber,
          routeName: routeName,
          routeColor: selectedColor,
          routeDetails: routeDetails,
          points: {
            goingTo: route.goingTo.map(x => ({
              sequence: x.sequence,
              address: x.address ?? "Unknown Address",
              point: [x.lat, x.lng] as [number, number],
            })),
            goingBack: route.goingBack.map(x => ({
              sequence: x.sequence,
              address: x.address ?? "Unknown Address",
              point: [x.lat, x.lng] as [number, number],
            })),
          },
        },
      });

      if (error) {
        console.error("Error saving route:", error);
        alert(getErrorMessage(error, fallbackMessage));
        return;
      }

      setRouteNumber("");
      setRouteName("");
      setSnapshotName("v1");
      setSnapshotState("wip");
      setRouteDetails("");
      clearAllWaypoints();
      stopCreating();
      onSaved?.();
      onClosed?.();
    } catch (error) {
      console.error("Error saving route:", error);
      alert(getErrorMessage(error, fallbackMessage));
    }
  };

  const handleCloseEditor = () => {
    if ((waypointCounts.goingTo + waypointCounts.goingBack) > 0) {
      const shouldDiscard = window.confirm(
        "You have waypoint items in this editor. Discard and close?",
      );

      if (!shouldDiscard) return;
    }

    setRouteNumber("");
    setRouteName("");
    setSnapshotName("v1");
    setSnapshotState("wip");
    setRouteDetails("");
    clearAllWaypoints();
    stopCreating();
    onClosed?.();
  };

  const handleWaypointDragStart = (
    event: DragEvent<HTMLDivElement>,
    waypointId: number,
  ) => {
    setDraggedWaypointId(waypointId);

    const sourceElement = event.currentTarget;
    const previewElement = sourceElement.cloneNode(true) as HTMLElement;
    previewElement.style.position = "fixed";
    previewElement.style.top = "-10000px";
    previewElement.style.left = "-10000px";
    previewElement.style.width = `${sourceElement.offsetWidth}px`;
    previewElement.style.pointerEvents = "none";
    previewElement.style.opacity = "0.95";
    previewElement.style.zIndex = "99999";

    document.body.appendChild(previewElement);
    event.dataTransfer.setDragImage(previewElement, 24, 24);
    dragPreviewRef.current = previewElement;
  };

  const cleanupDragPreview = () => {
    if (dragPreviewRef.current) {
      dragPreviewRef.current.remove();
      dragPreviewRef.current = null;
    }
    setDraggedWaypointId(null);
  };

  const handleOpenRouteDetails = () => {
    setDraftRouteDetails(routeDetails);
    setIsDetailsDialogOpen(true);
  };

  const handleSaveRouteDetails = () => {
    setRouteDetails(draftRouteDetails);
    setIsDetailsDialogOpen(false);
  };

  const canSave = waypointCounts.goingTo >= 2 && waypointCounts.goingBack >= 2;
  const isAdministrator = me?.data?.data?.role === "administrator_user";

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{editingRoute ? "Edit Route" : "Add Route"}</h2>
            <Badge className="mt-1" variant={editingRoute ? "default" : "secondary"}>
              {editingRoute ? "Edit Mode" : "Create Mode"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveRoute}
              disabled={!canSave || !routeNumber.trim() || !routeName.trim()}
            >
              Save
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleCloseEditor}
              aria-label="Close route editor"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="w-28 shrink-0 space-y-2">
                <Label htmlFor="route-version">Version</Label>
                <Input
                  id="route-version"
                  placeholder="e.g., v1"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                />
              </div>
              <div className="grow shrink-0 space-y-2">
                <Label>Snapshot State</Label>
                <Select value={snapshotState} onValueChange={(value) => setSnapshotState(value as "wip" | "for_approval" | "ready")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wip">WIP</SelectItem>
                    <SelectItem value="for_approval">For Approval</SelectItem>
                    {isAdministrator ? <SelectItem value="ready">Ready</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-20 shrink-0 space-y-2">
                <Label htmlFor="route-number">Route No.</Label>
                <Input
                  id="route-number"
                  placeholder="e.g., 101"
                  value={routeNumber}
                  onChange={(e) => setRouteNumber(e.target.value)}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="route-name">Route Name</Label>
                <Input
                  id="route-name"
                  placeholder="e.g., Downtown Express"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Route Details</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={handleOpenRouteDetails}
              >
                Add Route Details
              </Button>
              <p className="text-xs text-muted-foreground">
                {routeDetails.trim().length > 0
                  ? `Details saved (${routeDetails.trim().length} characters).`
                  : "No route details added yet."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Route Color</Label>
            <Select value={selectedColor} onValueChange={setSelectedColor}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select route color" />
              </SelectTrigger>
              <SelectContent>
                {ROUTE_COLORS.map((color) => (
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
            <Label>Direction</Label>
            <div className="bg-muted inline-flex rounded-md p-0.5 w-full">
              <button
                type="button"
                onClick={() => setActiveDirection("goingTo")}
                className={`grow rounded px-2 py-1 text-xs transition-colors ${
                  activeDirection === "goingTo" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Going To City ({waypointCounts.goingTo})
              </button>
              <button
                type="button"
                onClick={() => setActiveDirection("goingBack")}
                className={`grow rounded px-2 py-1 text-xs transition-colors ${
                  activeDirection === "goingBack" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Going Back ({waypointCounts.goingBack})
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1 max-h-72.5">
            {waypoints.map((waypoint, index) => (
              <div
                key={waypoint.id}
                draggable
                className={`space-y-3 rounded-lg border bg-background p-3 ${
                  activePointIndex === waypoint.id ? "border-primary" : "border-border"
                }`}
                onDragStart={(event) => handleWaypointDragStart(event, waypoint.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();

                  if (draggedWaypointId === null) return;
                  reorderWaypoints(draggedWaypointId, waypoint.id);
                  cleanupDragPreview();
                }}
                onDragEnd={cleanupDragPreview}
                onClick={() => setActivePointIndex(waypoint.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {activeDirection === "goingTo" ? "Going To" : "Going Back"} Waypoint {index + 1}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWaypoint(waypoint.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <InputGroup>
                  <InputGroupInput
                    readOnly
                    value={waypoint.address || (loadingAddresses.has(waypoint.id) ? "Loading address..." : "Click on map to add waypoint")}
                    placeholder="Address"
                    title={waypoint.address}
                  />
                  <InputGroupAddon align="inline-end" className="pr-2">
                    <InputGroupButton aria-label={`Pin waypoint ${index + 1}`}>
                      <MapPin />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            ))}
          </div>

          <Button
            className="w-full"
            variant="outline"
            onClick={() => {
              clearWaypoints();
            }}
            disabled={waypoints.length === 0}
          >
            Clear Active Direction
          </Button>

          <p className="text-xs text-muted-foreground">
            Use the direction tabs to edit each path independently. New map clicks are added to the active direction. Each direction needs at least 2 waypoints to save.
          </p>
        </CardContent>
      </Card>

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Route Details</DialogTitle>
            <DialogDescription>
              Add detailed route notes, service coverage information, or special instructions.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            id="route-details-dialog"
            placeholder="Describe the route coverage, stops, scheduling notes, landmarks, or other relevant details..."
            value={draftRouteDetails}
            onChange={(e) => setDraftRouteDetails(e.target.value)}
            className="min-h-56 max-h-[60vh] resize-y"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSaveRouteDetails}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RouteEditorProps {
  editingRoute?: AllResponse["routes"][0] | null
  snapshotParentRouteId?: string | null
  onSaved?: () => void
  onClosed?: () => void
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
