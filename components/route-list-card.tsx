"use client";

import { useState } from "react";

import type { AllResponse } from "@/components/app-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RouteListCard({
  routes,
  regions,
  closureLines,
  closureRegions,
  selectedRouteId,
  selectedRegionId,
  selectedClosureId,
  selectedClosureType,
  onRouteSelect,
  onRegionSelect,
  onClosureLineSelect,
  onClosureRegionSelect,
}: RouteListCardProps) {
  const [viewMode, setViewMode] = useState<"routes" | "regions" | "closures">("routes");

  return (
    <div className="pointer-events-auto absolute top-2 right-6 z-9998 w-1/8 min-w-64 max-w-72">
      <Card className="h-[40vh] min-h-52 gap-2 py-4">
        <CardHeader className="px-4 pb-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              {viewMode === "routes" ? "Routes" : viewMode === "regions" ? "Regions" : "Closures"}
            </CardTitle>
            <div className="bg-muted inline-flex rounded-md p-0.5">
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
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col px-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {viewMode === "routes"
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
                          onClick={() => onRouteSelect(route)}
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
              ) : viewMode === "regions" ? (
                regions.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center">No regions available</p>
                ) : (
                  regions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      onClick={() => onRegionSelect(region)}
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
                      </span>
                    </button>
                  ))
                )
              ) : (
                (closureLines.length + closureRegions.length) === 0 ? (
                  <p className="text-muted-foreground text-sm text-center">No closures available</p>
                ) : (
                  [
                    ...closureLines.map((closure) => ({
                      id: closure.id,
                      type: "line" as const,
                      label: closure.label,
                      color: closure.color,
                      direction: closure.direction,
                      onClick: () => onClosureLineSelect(closure),
                    })),
                    ...closureRegions.map((closure) => ({
                      id: closure.id,
                      type: "region" as const,
                      label: closure.label,
                      color: closure.color,
                      onClick: () => onClosureRegionSelect(closure),
                    })),
                  ]
                    .toSorted((a, b) => {
                      if (a.type !== b.type) return a.type.localeCompare(b.type);
                      return (a.label || "").localeCompare(b.label || "");
                    })
                    .map((closure) => {
                      const isSelected = selectedClosureId === closure.id && selectedClosureType === closure.type;
                      const typeLabel = closure.type === "line" ? "Line" : "Region";
                      const secondary = closure.type === "line"
                        ? `${typeLabel} • ${closure.direction === "one_way" ? "one-way" : "both ways"}`
                        : typeLabel;

                      return (
                        <button
                          key={`${closure.type}-${closure.id}`}
                          type="button"
                          onClick={closure.onClick}
                          className={`hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            isSelected ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: closure.color }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{closure.label?.trim() ? closure.label : "(untitled)"}</span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {secondary}
                            </span>
                          </span>
                        </button>
                      );
                    })
                )
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface RouteListCardProps {
  routes: AllResponse["routes"];
  regions: AllResponse["regions"];
  closureLines: NonNullable<AllResponse["closures"]>["lineClosures"];
  closureRegions: NonNullable<AllResponse["closures"]>["regionClosures"];
  selectedRouteId: string | null;
  selectedRegionId: string | null;
  selectedClosureId: string | null;
  selectedClosureType: "line" | "region" | null;
  onRouteSelect: (route: AllResponse["routes"][0]) => void;
  onRegionSelect: (region: AllResponse["regions"][0]) => void;
  onClosureLineSelect: (closure: NonNullable<AllResponse["closures"]>["lineClosures"][0]) => void;
  onClosureRegionSelect: (closure: NonNullable<AllResponse["closures"]>["regionClosures"][0]) => void;
}
