"use client";

import { ChevronLeft, Eraser, PenLine, Pencil, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useStopDashboard } from "@/contexts/StopDashboardContext";
import type { StopRestrictionType, StopDisallowedDirection } from "@/contracts/responses";

const stopDraftSchema = z.object({
  name: z.string().trim().min(1, "Stop name is required."),
  restrictionType: z.enum(["universal", "specific"]),
  disallowedDirection: z.enum(["direction_to", "direction_back", "both"]),
  points: z.array(
    z.object({
      sequence: z.number().int().positive(),
      point: z.tuple([z.number().finite(), z.number().finite()]),
    }),
  ).min(2, "At least 2 points are required."),
  routeIds: z.array(z.string().uuid()),
  vehicleTypeIds: z.array(z.string().uuid()),
}).superRefine((value, context) => {
  if (value.restrictionType === "specific" && value.routeIds.length === 0 && value.vehicleTypeIds.length === 0) {
    context.addIssue({
      code: "custom",
      message: "For disallowed restrictions, select at least one route or one vehicle type.",
      path: ["restrictionType"],
    });
  }
});

export type StopDraftSubmitPayload = z.infer<typeof stopDraftSchema>;

interface RouteOption {
  id: string;
  label: string;
}

interface VehicleTypeOption {
  id: string;
  label: string;
}

interface StopEditorProps {
  routeOptions: RouteOption[];
  vehicleTypeOptions: VehicleTypeOption[];
  isSaving: boolean;
  onSave: (payload: StopDraftSubmitPayload) => Promise<void>;
}

interface EditorErrors {
  name?: string;
  restrictionType?: string;
  points?: string;
}

const restrictionTypeOptions: Array<{ value: StopRestrictionType; label: string }> = [
  { value: "universal", label: "Universal" },
  { value: "specific", label: "Specific Routes/Vehicle Types" },
];

const disallowedDirectionOptions: Array<{ value: StopDisallowedDirection; label: string }> = [
  { value: "both", label: "Both Directions" },
  { value: "direction_to", label: "Direction To" },
  { value: "direction_back", label: "Direction Back" },
];

export default function StopEditor({
  routeOptions,
  vehicleTypeOptions,
  isSaving,
  onSave,
}: StopEditorProps) {
  const {
    editorMode,
    draft,
    activeStopTool,
    closeEditor,
    setActiveStopTool,
    finishStopToolEditing,
    updateDraftName,
    updateDraftRestrictionType,
    updateDraftDisallowedDirection,
    updateDraftRouteIds,
    updateDraftVehicleTypeIds,
    updateDraftPoints,
  } = useStopDashboard();

  const [errors, setErrors] = useState<EditorErrors>({});

  const routeIds = useMemo(() => new Set(draft?.routeIds ?? []), [draft?.routeIds]);
  const vehicleTypeIds = useMemo(() => new Set(draft?.vehicleTypeIds ?? []), [draft?.vehicleTypeIds]);

  if (!draft || !editorMode) {
    return null;
  }

  const handleToggleRoute = (routeId: string, checked: boolean) => {
    const next = checked
      ? [...draft.routeIds, routeId]
      : draft.routeIds.filter((id) => id !== routeId);

    updateDraftRouteIds(next);
  };

  const handleToggleVehicleType = (vehicleTypeId: string, checked: boolean) => {
    const next = checked
      ? [...draft.vehicleTypeIds, vehicleTypeId]
      : draft.vehicleTypeIds.filter((id) => id !== vehicleTypeId);

    updateDraftVehicleTypeIds(next);
  };

  const handleSave = async () => {
    const parsed = stopDraftSchema.safeParse({
      name: draft.name,
      restrictionType: draft.restrictionType,
      disallowedDirection: draft.disallowedDirection,
      points: draft.points.map((point) => ({
        sequence: point.sequence,
        point: point.point,
      })),
      routeIds: draft.routeIds,
      vehicleTypeIds: draft.vehicleTypeIds,
    });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        restrictionType: fieldErrors.restrictionType?.[0],
        points: fieldErrors.points?.[0],
      });
      return;
    }

    setErrors({});
    await onSave(parsed.data);
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4 animate-in slide-in-from-left-6 duration-200">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {editorMode === "creating" ? "Create Stop" : "Edit Stop"}
            </h2>
            <Badge className="mt-1" variant={editorMode === "editing" ? "default" : "secondary"}>
              {editorMode === "editing" ? "Edit Mode" : "Create Mode"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1 h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={closeEditor}
              aria-label="Back from stop editor"
              disabled={isSaving}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto">
          <div className="grid gap-1.5">
            <Label htmlFor="stop-name">Stop name</Label>
            <Input
              id="stop-name"
              value={draft.name}
              onChange={(event) => updateDraftName(event.target.value)}
              placeholder="e.g. No Loading Along Rizal Street"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="restriction-type">Restriction Type</Label>
            <NativeSelect
              id="restriction-type"
              value={draft.restrictionType}
              onChange={(event) => updateDraftRestrictionType(event.target.value as StopRestrictionType)}
              aria-invalid={Boolean(errors.restrictionType)}
              className="w-full"
            >
              {restrictionTypeOptions.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errors.restrictionType ? <p className="text-xs text-destructive">{errors.restrictionType}</p> : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="disallowed-direction">Disallowed Direction</Label>
            <NativeSelect
              id="disallowed-direction"
              value={draft.disallowedDirection}
              onChange={(event) => updateDraftDisallowedDirection(event.target.value as StopDisallowedDirection)}
              className="w-full"
            >
              {disallowedDirectionOptions.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-3">
            <Label>Line Tools</Label>
            <div className="grid grid-cols-4 gap-2">
              <Button
                type="button"
                variant={activeStopTool === "draw-line" ? "secondary" : "outline"}
                onClick={() => setActiveStopTool("draw-line")}
                aria-label="Draw stop line"
              >
                <PenLine className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={activeStopTool === "edit-line" ? "secondary" : "outline"}
                onClick={() => setActiveStopTool("edit-line")}
                aria-label="Edit stop line"
                disabled={draft.points.length < 2}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  updateDraftPoints([]);
                  setActiveStopTool("draw-line");
                }}
                aria-label="Clear stop line"
                disabled={draft.points.length === 0}
              >
                <Eraser className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={finishStopToolEditing}
                aria-label="Finish line editing"
              >
                Done
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Draw or edit the restricted road segment directly on the map. At least 2 points are required.
            </p>
            {errors.points ? <p className="text-xs text-destructive">{errors.points}</p> : null}
          </div>

          {draft.restrictionType === "specific" ? (
            <>
              <div className="space-y-2">
                <Label>Disallowed Routes</Label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                  {routeOptions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No routes available</p>
                  ) : (
                    routeOptions.map((route) => (
                      <label key={route.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={routeIds.has(route.id)}
                          onCheckedChange={(value) => handleToggleRoute(route.id, Boolean(value))}
                        />
                        <span>{route.label}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Disallowed Vehicle Types</Label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                  {vehicleTypeOptions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No vehicle types available</p>
                  ) : (
                    vehicleTypeOptions.map((vehicleType) => (
                      <label key={vehicleType.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={vehicleTypeIds.has(vehicleType.id)}
                          onCheckedChange={(value) => handleToggleVehicleType(vehicleType.id, Boolean(value))}
                        />
                        <span>{vehicleType.label}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
