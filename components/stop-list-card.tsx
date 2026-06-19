"use client";

import { useState } from "react";
import { Settings } from "lucide-react";

import type {
  RestrictedBoardingZoneResponseList,
  StopResponseList,
} from "@/contracts/responses";
import { formatRbzDisallowedDirection, formatRbzRestrictionType } from "@/lib/stops/display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { DashboardTab } from "@/contexts/StopDashboardContext";

interface StopListCardProps {
  activeTab: DashboardTab;
  stops: StopResponseList;
  rbzList: RestrictedBoardingZoneResponseList;
  isLoadingStops: boolean;
  isLoadingRbz: boolean;
  selectedTransitStopId: string | null;
  selectedRbzId: string | null;
  routeOverlayEnabled: boolean;
  onTabChange: (tab: DashboardTab) => void;
  onSelectStop: (stopId: string) => void;
  onSelectRbz: (zoneId: string) => void;
  onCreateStop: () => void;
  onCreateRbz: () => void;
  onToggleRouteOverlay: (enabled: boolean) => void;
}

export default function StopListCard({
  activeTab,
  stops,
  rbzList,
  isLoadingStops,
  isLoadingRbz,
  selectedTransitStopId,
  selectedRbzId,
  routeOverlayEnabled,
  onTabChange,
  onSelectStop,
  onSelectRbz,
  onCreateStop,
  onCreateRbz,
  onToggleRouteOverlay,
}: StopListCardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isLoading = activeTab === "stops" ? isLoadingStops : isLoadingRbz;

  return (
    <>
      <div className="pointer-events-auto absolute top-1 right-6 bottom-1 z-9998 w-1/8 min-w-64 max-w-80">
        <Card className="h-[calc(100vh-80px)] min-h-0 gap-2 py-4">
          <CardHeader className="px-4 pb-1">
            <div className="flex gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={() => onTabChange("stops")}
                className={`flex-1 rounded-sm px-2 py-1 text-sm transition-colors ${
                  activeTab === "stops" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                Stops
              </button>
              <button
                type="button"
                onClick={() => onTabChange("restricted-zones")}
                className={`flex-1 rounded-sm px-2 py-1 text-sm transition-colors ${
                  activeTab === "restricted-zones" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                Restricted Zones
              </button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-4">
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                  <p className="text-muted-foreground text-sm">
                    {activeTab === "stops" ? "Loading stops..." : "Loading restricted zones..."}
                  </p>
                </div>
              ) : activeTab === "stops" ? (
                stops.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center">No stops available</p>
                ) : (
                  stops
                    .toSorted((a, b) => a.number - b.number)
                    .map((stop) => {
                      const isSelected = selectedTransitStopId === stop.id;
                      return (
                        <button
                          key={stop.id}
                          type="button"
                          onClick={() => onSelectStop(stop.id)}
                          className={`hover:bg-accent hover:text-accent-foreground flex w-full flex-col items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            isSelected ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="line-clamp-2 font-medium">Stop #{stop.number}</span>
                            <Badge
                              variant="outline"
                              className={stop.isPublic
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-amber-300 bg-amber-50 text-amber-700"}
                            >
                              {stop.isPublic ? "Published" : "Draft"}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground line-clamp-2 text-xs">{stop.address}</p>
                        </button>
                      );
                    })
                )
              ) : rbzList.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center">No restricted zones available</p>
              ) : (
                rbzList
                  .toSorted((a, b) => a.name.localeCompare(b.name))
                  .map((zone) => {
                    const isSelected = selectedRbzId === zone.id;
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => onSelectRbz(zone.id)}
                        className={`hover:bg-accent hover:text-accent-foreground flex w-full flex-col items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          isSelected ? "border-primary bg-accent" : "border-border"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="line-clamp-2 font-medium">{zone.name}</span>
                          <Badge
                            variant="outline"
                            className={zone.isPublic
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"}
                          >
                            {zone.isPublic ? "Published" : "Draft"}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {formatRbzRestrictionType(zone.restrictionType)} · {formatRbzDisallowedDirection(zone.disallowedDirection)}
                        </p>
                      </button>
                    );
                  })
              )}
            </div>

            <div className="mt-3 space-y-2 border-t pt-3">
              <Button
                type="button"
                className="w-full"
                onClick={activeTab === "stops" ? onCreateStop : onCreateRbz}
              >
                {activeTab === "stops" ? "Create New Stop" : "Create New Restricted Zone"}
              </Button>

              {activeTab === "stops" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Settings</DialogTitle>
            <DialogDescription>
              Configure map display options for the stops tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Show Route Overlay</p>
              <p className="text-muted-foreground text-xs">
                Display route polylines on the map while managing stops.
              </p>
            </div>
            <Switch
              checked={routeOverlayEnabled}
              onCheckedChange={onToggleRouteOverlay}
              aria-label="Toggle route overlay"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
