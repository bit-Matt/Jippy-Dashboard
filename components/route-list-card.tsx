"use client";

import { useState } from "react";

import type { AllResponse } from "@/components/app-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RouteListCard({
  routes,
  regions,
  selectedRouteId,
  selectedRegionId,
  onRouteSelect,
  onRegionSelect,
}: RouteListCardProps) {
  const [viewMode, setViewMode] = useState<"routes" | "regions">("routes");

  return (
    <div className="pointer-events-auto absolute top-2 right-6 z-9998 w-1/8 min-w-64 max-w-72">
      <Card className="h-[40vh] min-h-52 gap-2 py-4">
        <CardHeader className="px-4 pb-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{viewMode === "routes" ? "Routes" : "Regions"}</CardTitle>
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col px-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {viewMode === "routes"
              ? (
                routes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No routes available</p>
                ) : (
                  routes.map((route) => {
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
              ) : (
                regions.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No regions available</p>
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
  selectedRouteId: string | null;
  selectedRegionId: string | null;
  onRouteSelect: (route: AllResponse["routes"][0]) => void;
  onRegionSelect: (region: AllResponse["regions"][0]) => void;
}
