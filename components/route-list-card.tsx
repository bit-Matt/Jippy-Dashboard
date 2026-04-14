"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import type {
  ClosureResponse,
  ClosureResponseList,
  RegionListItemResponse,
  RegionListItemResponseList,
  RouteListItemResponse,
  RouteListItemResponseList,
} from "@/contracts/responses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
  onAddRoute,
  onAddRegion,
  onAddClosure,
  onOpenRouteMapSettings,
  routeMapSettingsLabel,
  routeWarningRouteIds,
}: RouteListCardProps) {
  const [viewMode, setViewMode] = useState<"routes" | "regions" | "closures">(
    mode === "regions"
      ? "regions"
      : mode === "closures"
        ? "closures"
        : "routes",
  );
  const allowRoutes = mode === "all" || mode === "route-closures" || mode === "routes";
  const allowRegions = mode === "all" || mode === "regions";
  const allowClosures = mode === "all" || mode === "route-closures" || mode === "closures";

  const title = viewMode === "routes"
    ? "Routes"
    : viewMode === "regions"
      ? "Regions"
      : "Closures";

  return (
    <div className="pointer-events-auto absolute top-1 right-6 bottom-1 z-9998 w-1/8 min-w-64 max-w-72">
      <Card className="h-[calc(100vh-80px)] min-h-0 gap-2 py-4">
        <CardHeader className="px-4 pb-1">
          <CardTitle className="text-base">
            {title}
          </CardTitle>
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
          ) : mode === "routes" || mode === "closures" ? null : null}
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
                      const hasClosureWarning = routeWarningRouteIds?.has(route.id) ?? false;

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
                            <span className="flex items-center gap-1">
                              <span className="block min-w-0 truncate">
                                {route.routeNumber} - {route.routeName}
                              </span>
                              {hasClosureWarning ? (
                                <TriangleAlert
                                  aria-label="Route intersects active closure"
                                  className="h-3.5 w-3.5 shrink-0 text-amber-500"
                                />
                              ) : null}
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
                          </span>
                        </button>
                      );
                    })
                )
              ) : (
                <p className="text-muted-foreground text-sm text-center">No items available</p>
              )}
          </div>

          {(onAddRoute || onAddRegion || onAddClosure) ? (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">Create</p>
              <div className="mt-2 flex flex-col gap-2">
                {onAddRoute ? (
                  <Button type="button" size="sm" variant="outline" onClick={onAddRoute}>
                    Add Route
                  </Button>
                ) : null}
                {onAddClosure ? (
                  <Button type="button" size="sm" variant="outline" onClick={onAddClosure}>
                    Add Closure
                  </Button>
                ) : null}
                {onAddRegion ? (
                  <Button type="button" size="sm" variant="outline" onClick={onAddRegion}>
                    Add Region
                  </Button>
                ) : null}

                {onOpenRouteMapSettings && viewMode === "routes" ? (
                  <>
                    <Separator />
                    <Button type="button" size="sm" variant="secondary" onClick={onOpenRouteMapSettings}>
                      {routeMapSettingsLabel ?? "Map Settings"}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

interface RouteListCardProps {
  mode?: "all" | "route-closures" | "regions" | "routes" | "closures";
  routes: RouteListItemResponseList;
  regions: RegionListItemResponseList;
  closures: ClosureResponseList;
  isRoutesLoading: boolean;
  selectedRouteId: string | null;
  selectedRegionId: string | null;
  selectedClosureId: string | null;
  onRouteSelect?: (route: RouteListItemResponse) => void;
  onRegionSelect?: (region: RegionListItemResponse) => void;
  onClosureSelect?: (closure: ClosureResponse) => void;
  onAddRoute?: () => void;
  onAddRegion?: () => void;
  onAddClosure?: () => void;
  onOpenRouteMapSettings?: () => void;
  routeMapSettingsLabel?: string;
  routeWarningRouteIds?: ReadonlySet<string>;
}
