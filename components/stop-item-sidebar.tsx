"use client";

import { X } from "lucide-react";

import type { StopResponse } from "@/contracts/responses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface StopItemSidebarProps {
  stop: StopResponse;
  userRole: string | null;
  routeNameLookup: Record<string, string>;
  vehicleTypeNameLookup: Record<string, string>;
  isPublishing: boolean;
  isDeletingStop: boolean;
  onClose: () => void;
  onEditStop: () => void;
  onDeleteStop: () => void;
  onTogglePublic: (isPublic: boolean) => void;
}

const asDisplayList = (ids: string[], lookup: Record<string, string>) => {
  return ids.map((id) => lookup[id] ?? id);
};

export default function StopItemSidebar({
  stop,
  userRole,
  routeNameLookup,
  vehicleTypeNameLookup,
  isPublishing,
  isDeletingStop,
  onClose,
  onEditStop,
  onDeleteStop,
  onTogglePublic,
}: StopItemSidebarProps) {
  const isAdministrator = userRole === "administrator_user";
  const isPublished = stop.isPublic;
  const resolvedRoutes = asDisplayList(stop.routeIds, routeNameLookup);
  const resolvedVehicleTypes = asDisplayList(stop.vehicleTypeIds, vehicleTypeNameLookup);

  return (
    <Card>
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Stop Details</CardTitle>
            <p className="text-sm font-medium">{stop.name.trim() || "(untitled)"}</p>
            <Badge
              className={`mt-1 w-fit ${
                stop.isPublic
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }`}
              variant="outline"
            >
              {stop.isPublic ? "Published" : "Draft"}
            </Badge>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close stop details" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-h-[75vh] space-y-3 overflow-y-auto">
        <div className="space-y-1 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Restriction Type</p>
          <p className="text-sm font-medium">
            {stop.restrictionType === "universal" ? "Universal restriction" : "Disallowed restriction"}
          </p>
        </div>

        {stop.restrictionType === "specific" ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Disallowed Routes</p>
              {resolvedRoutes.length === 0 ? (
                <p className="text-sm">No route restrictions configured.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {resolvedRoutes.map((routeName) => (
                    <li key={routeName}>{routeName}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Disallowed Vehicle Types</p>
              {resolvedVehicleTypes.length === 0 ? (
                <p className="text-sm">No vehicle type restrictions configured.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {resolvedVehicleTypes.map((vehicleTypeName) => (
                    <li key={vehicleTypeName}>{vehicleTypeName}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Public Visibility</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${stop.isPublic ? "text-emerald-700" : "text-amber-700"}`}>
                {stop.isPublic ? "Published" : "Unpublished"}
              </p>
              <p className="text-muted-foreground text-xs">
                {stop.isPublic
                  ? "Visible in public-facing map data."
                  : "Only visible in management tools."}
              </p>
            </div>
            {isAdministrator ? (
              <Switch
                checked={stop.isPublic}
                disabled={isPublishing}
                onCheckedChange={onTogglePublic}
                aria-label="Toggle stop visibility"
              />
            ) : null}
          </div>
          {!isAdministrator ? (
            <p className="text-muted-foreground text-xs">Only administrators can change visibility.</p>
          ) : null}
        </div>

        <Separator />

        <Button
          type="button"
          className="w-full"
          variant="outline"
          onClick={onEditStop}
          disabled={isPublishing || isDeletingStop || isPublished}
        >
          {isPublished ? "Unpublish To Edit" : "Edit Stop"}
        </Button>

        <Button
          type="button"
          className="w-full"
          variant="destructive"
          onClick={onDeleteStop}
          disabled={isDeletingStop || isPublishing || (!isAdministrator && isPublished)}
        >
          {isDeletingStop ? "Deleting Stop..." : "Delete Stop"}
        </Button>

        {!isAdministrator && isPublished ? (
          <p className="text-muted-foreground text-xs">Only administrators can delete published stops.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
