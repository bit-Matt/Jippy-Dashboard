"use client";

import { useState } from "react";

import type { AllResponse } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RouteListCard({
  mode = "all",
  routes,
  regions,
  closures,
  isRoutesLoading,
  selectedRouteId,
  selectedRegionId,
  selectedClosureId,
  onRouteSelect,
  onRegionSelect,
  onClosureSelect,
  onManageSnapshots,
  manageSnapshotsDisabled,
  selectedItemVersionName,
  selectedItemSnapshotState,
  selectedItemModeLabel,
}: RouteListCardProps) {
  const [viewMode, setViewMode] = useState<"routes" | "regions" | "closures">(
    mode === "regions" ? "regions" : "routes",
  );
  const allowRoutes = mode === "all" || mode === "route-closures";
  const allowRegions = mode === "all" || mode === "regions";
  const allowClosures = mode === "all" || mode === "route-closures";

  const title = viewMode === "routes"
    ? "Routes"
    : viewMode === "regions"
      ? "Regions"
      : "Closures";

  return (
    <div className="pointer-events-auto absolute top-2 right-6 z-9998 w-1/8 min-w-64 max-w-72">
      <Card className="h-[40vh] min-h-52 gap-2 py-4">
        <CardHeader className="px-4 pb-1">
          <CardTitle className="text-base">
            {title}
          </CardTitle>
          {onManageSnapshots ? (
            <div className="mt-2 rounded-md border p-2">
              <p className="text-xs text-muted-foreground">
                {selectedItemVersionName
                  ? `Selected version: ${selectedItemVersionName}`
                  : "Select an item to manage snapshots."}
              </p>
              {selectedItemSnapshotState ? (
                <Badge className="mt-1" variant={selectedItemSnapshotState === "ready" ? "default" : "secondary"}>
                  {selectedItemSnapshotState}
                </Badge>
              ) : null}
              {selectedItemModeLabel ? (
                <p className="mt-1 text-xs text-muted-foreground">{selectedItemModeLabel}</p>
              ) : null}
              <Button
                type="button"
                className="mt-2 w-full"
                size="sm"
                variant="outline"
                onClick={onManageSnapshots}
                disabled={manageSnapshotsDisabled}
              >
                Manage Snapshots
              </Button>
            </div>
          ) : null}
          {mode === "all" ? (
            <div className="bg-muted mt-2 inline-flex rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("routes")}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  viewMode === "routes" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Routes
              </button>
              <button
                type="button"
                onClick={() => setViewMode("regions")}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  viewMode === "regions" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Regions
              </button>
              <button
                type="button"
                onClick={() => setViewMode("closures")}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  viewMode === "closures" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Closures
              </button>
            </div>
          ) : mode === "route-closures" ? (
            <div className="bg-muted mt-2 inline-flex rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("routes")}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  viewMode === "routes" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Routes
              </button>
              <button
                type="button"
                onClick={() => setViewMode("closures")}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  viewMode === "closures" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Closures
              </button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col px-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {isRoutesLoading ? (
              <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                <p className="text-muted-foreground text-sm">Loading routes...</p>
              </div>
            ) : allowRoutes && viewMode === "routes"
              ? (
                routes.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center">No routes available</p>
                ) : (
                  routes
                    .toSorted((a, b) => a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true }))
                    .map((route) => {
                      const routeDistrict = "routeDistrict" in route
                        ? (route.routeDistrict as string | null | undefined)
                        : undefined;

                      return (
                        <button
                          key={route.id}
                          type="button"
                          onClick={() => onRouteSelect?.(route)}
                          className={`hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            selectedRouteId === route.id ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: route.routeColor }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {route.routeNumber} - {route.routeName}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {route.snapshotName} ({route.snapshotState})
                            </span>
                            {routeDistrict ? (
                              <span className="text-muted-foreground block truncate text-xs">
                                {routeDistrict}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })
                )
              ) : allowRegions && viewMode === "regions" ? (
                regions.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center">No regions available</p>
                ) : (
                  regions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      onClick={() => onRegionSelect?.(region)}
                      className={`hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selectedRegionId === region.id ? "border-primary bg-accent" : "border-border"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: region.regionColor }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{region.regionName}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {region.snapshotName} ({region.snapshotState})
                        </span>
                      </span>
                    </button>
                  ))
                )
              ) : allowClosures ? (
                closures.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center">No closures available</p>
                ) : (
                  closures
                    .toSorted((a, b) => {
                      return (a.closureName || "").localeCompare(b.closureName || "");
                    })
                    .map((closure) => {
                      const isSelected = selectedClosureId === closure.id;

                      return (
                        <button
                          key={closure.id}
                          type="button"
                          onClick={() => onClosureSelect?.(closure)}
                          className={`hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            isSelected ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: "#e81123" }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {closure.closureName?.trim() ? closure.closureName : "(untitled)"}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {closure.versionName} ({closure.snapshotState})
                            </span>
                          </span>
                        </button>
                      );
                    })
                )
              ) : (
                <p className="text-muted-foreground text-sm text-center">No items available</p>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface RouteListCardProps {
  mode?: "all" | "route-closures" | "regions";
  routes: AllResponse["routes"];
  regions: AllResponse["regions"];
  closures: AllResponse["closures"];
  isRoutesLoading: boolean;
  selectedRouteId: string | null;
  selectedRegionId: string | null;
  selectedClosureId: string | null;
  onRouteSelect?: (route: AllResponse["routes"][0]) => void;
  onRegionSelect?: (region: AllResponse["regions"][0]) => void;
  onClosureSelect?: (closure: AllResponse["closures"][0]) => void;
  onManageSnapshots?: () => void;
  manageSnapshotsDisabled?: boolean;
  selectedItemVersionName?: string | null;
  selectedItemSnapshotState?: string | null;
  selectedItemModeLabel?: string | null;
}
