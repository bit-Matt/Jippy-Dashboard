"use client";

import type { StopResponseList } from "@/contracts/responses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StopListCardProps {
  stops: StopResponseList;
  isLoading: boolean;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onCreateStop: () => void;
}

export default function StopListCard({
  stops,
  isLoading,
  selectedStopId,
  onSelectStop,
  onCreateStop,
}: StopListCardProps) {
  return (
    <div className="pointer-events-auto absolute top-1 right-6 bottom-1 z-9998 w-1/8 min-w-64 max-w-80">
      <Card className="h-[calc(100vh-80px)] min-h-0 gap-2 py-4">
        <CardHeader className="px-4 pb-1">
          <CardTitle className="text-base">Stops</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col px-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                <p className="text-muted-foreground text-sm">Loading stops...</p>
              </div>
            ) : stops.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center">No stops available</p>
            ) : (
              stops
                .toSorted((a, b) => a.name.localeCompare(b.name))
                .map((stop) => {
                  const isSelected = selectedStopId === stop.id;
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
                        <span className="line-clamp-2 font-medium">{stop.name}</span>
                        <Badge
                          variant="outline"
                          className={stop.isPublic
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-amber-300 bg-amber-50 text-amber-700"}
                        >
                          {stop.isPublic ? "Published" : "Draft"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Restriction: {stop.restrictionType === "universal" ? "Universal" : "Specific"}
                      </p>
                    </button>
                  );
                })
            )}
          </div>

          <div className="mt-3 border-t pt-3">
            <Button type="button" className="w-full" onClick={onCreateStop}>
              Create New Stop
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
