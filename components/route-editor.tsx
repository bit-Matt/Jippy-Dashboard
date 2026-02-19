"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouteEditor } from "@/contexts/RouteEditorContext";
import { nominatim } from "@/lib/osm/client/nominatim";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Check, MapPin, Trash2, X } from "lucide-react";

const COLORS = [
  "#fff100", "#ff8c00", "#e81123",
  "#ec008c", "#68217a", "#00188f",
  "#00bcf2", "#00b294", "#009e49",
  "#bad80a",
];

export default function RouteEditor() {
  const [routeNumber, setRouteNumber] = useState("");
  const [routeName, setRouteName] = useState("");
  const [draggedWaypointId, setDraggedWaypointId] = useState<number | null>(null);
  const [addresses, setAddresses] = useState<Record<number, string>>({});
  const [addressCoords, setAddressCoords] = useState<Record<number, string>>({});
  const [loadingAddresses, setLoadingAddresses] = useState<Set<number>>(new Set());
  const {
    selectedColor,
    setSelectedColor,
    waypoints,
    activePointIndex,
    setActivePointIndex,
    removeWaypoint,
    reorderWaypoints,
    clearWaypoints,
    saveRoute,
    stopCreating,
  } = useRouteEditor();

  // Reverse geocode waypoints to get addresses
  useEffect(() => {
    const geocodeWaypoints = async () => {
      const newAddresses: Record<number, string> = { ...addresses };
      const newAddressCoords: Record<number, string> = { ...addressCoords };
      const toGeocode: typeof waypoints = [];

      // Find waypoints that don't have addresses yet
      waypoints.forEach((waypoint) => {
        const waypointCoords = `${waypoint.lat},${waypoint.lng}`;

        if (addressCoords[waypoint.id] !== waypointCoords && !loadingAddresses.has(waypoint.id)) {
          toGeocode.push(waypoint);
        }
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
          { restricted: false },
        );

        if (data && data.data) {
          newAddresses[waypoint.id] = data.data.display_name || "Unknown location";
          newAddressCoords[waypoint.id] = `${waypoint.lat},${waypoint.lng}`;
        } else if (error) {
          newAddresses[waypoint.id] = "Unable to fetch address";
          newAddressCoords[waypoint.id] = `${waypoint.lat},${waypoint.lng}`;
          console.error("Geocoding error:", error);
        }
      }

      setAddresses(newAddresses);
      setAddressCoords(newAddressCoords);
      setLoadingAddresses((prev) => {
        const updated = new Set(prev);
        toGeocode.forEach((wp) => updated.delete(wp.id));
        return updated;
      });
    };

    geocodeWaypoints();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  const handleSaveRoute = () => {
    if (!routeNumber.trim() || !routeName.trim()) {
      console.warn("Route number and name are required");
      return;
    }

    const route = saveRoute();
    if (route) {
      console.log("Route saved:", {
        number: routeNumber,
        name: routeName,
        waypoints: route,
      });
      // TODO: Persist route to database
      setRouteNumber("");
      setRouteName("");
      setAddresses({});
      setAddressCoords({});
      clearWaypoints();
      stopCreating();
    }
  };

  const handleCloseEditor = () => {
    if (waypoints.length > 0) {
      const shouldDiscard = window.confirm(
        "You have waypoint items in this editor. Discard and close?",
      );

      if (!shouldDiscard) return;
    }

    setRouteNumber("");
    setRouteName("");
    setAddresses({});
    setAddressCoords({});
    clearWaypoints();
    stopCreating();
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-base font-semibold">Add Route</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveRoute}
              disabled={waypoints.length < 2 || !routeNumber.trim() || !routeName.trim()}
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
            <div className="space-y-2">
              <Label htmlFor="route-number">Route Number</Label>
              <Input
                id="route-number"
                placeholder="e.g., 101"
                value={routeNumber}
                onChange={(e) => setRouteNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
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
            <Label>Route Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className="relative h-10 w-10 rounded-full border-2 transition-transform hover:scale-105"
                  style={{
                    backgroundColor: color,
                    borderColor: selectedColor === color ? "#111827" : "#e5e7eb",
                  }}
                >
                  {selectedColor === color && (
                    <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-lg" />
                  )}
                </button>
              ))}
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
                onDragStart={() => setDraggedWaypointId(waypoint.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();

                  if (draggedWaypointId === null) return;
                  reorderWaypoints(draggedWaypointId, waypoint.id);
                  setDraggedWaypointId(null);
                }}
                onDragEnd={() => setDraggedWaypointId(null)}
                onClick={() => setActivePointIndex(waypoint.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Waypoint {index + 1}
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
                    value={addresses[waypoint.id] || (loadingAddresses.has(waypoint.id) ? "Loading address..." : "Click on map to add waypoint")}
                    placeholder="Address"
                    title={addresses[waypoint.id]}
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
              setAddresses({});
              setAddressCoords({});
            }}
            disabled={waypoints.length === 0}
          >
            Clear Waypoints
          </Button>

          <p className="text-xs text-muted-foreground">
            Click map to add points. Drag waypoint cards up or down to reorder sequence. Points are locked after placement; click a waypoint card to enable dragging that point on the map. You need at least 2 waypoints to save.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
