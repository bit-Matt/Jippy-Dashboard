"use client";

import type { RouteListItemResponse } from "@/contracts/responses";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RouteOverlayPanelProps {
  routes: RouteListItemResponse[];
  selectedRouteIds: string[];
  onToggleRoute: (routeId: string, checked: boolean) => void;
}

export default function RouteOverlayPanel({
  routes,
  selectedRouteIds,
  onToggleRoute,
}: RouteOverlayPanelProps) {
  const selectedSet = new Set(selectedRouteIds);

  return (
    <div className="pointer-events-auto absolute top-1 right-[340px] z-9998 w-56 min-w-48 max-w-64">
      <Card className="max-h-[calc(100vh-80px)] gap-2 py-4">
        <CardHeader className="px-4 pb-1">
          <CardTitle className="text-base">Route Overlay</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col px-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {routes.length === 0 ? (
              <p className="text-muted-foreground text-sm">No routes available</p>
            ) : (
              routes.map((route) => (
                <label key={route.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={selectedSet.has(route.id)}
                    onCheckedChange={(value) => onToggleRoute(route.id, Boolean(value))}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{route.routeNumber}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">{route.routeName}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
