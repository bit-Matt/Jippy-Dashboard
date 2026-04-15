"use client";

import { CalendarIcon, ChevronLeft, PenTool, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClosureEditor } from "@/contexts/ClosureEditorContext";

import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ApiResponseBuilder";
import type { ClosureObject } from "@/contracts/responses";
import { getErrorMessage } from "@/contracts/parsers";

const closurePayloadSchema = z.object({
  closureName: z.string(),
  closureDescription: z.string(),
  shape: z.string().min(1).default("polygon"),
  closureType: z.enum(["indefinite", "scheduled"]),
  endDate: z.date().nullable(),
  points: z.array(
    z.object({
      sequence: z.number(),
      point: z.tuple([z.number().finite(), z.number().finite()]),
    }),
  ).min(3, "Please add at least 3 points for the closure region."),
}).superRefine((data, ctx) => {
  if (data.closureType === "scheduled" && !data.endDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End date is required for scheduled closures.", path: ["endDate"] });
  }
});

interface ClosureRegionEditorProps {
  onSaved: () => void | Promise<void>;
}

export default function ClosureRegionEditor({ onSaved }: ClosureRegionEditorProps) {
  const {
    mode,
    activeClosureId,
    activeClosureTool,
    hasDefinedPolygon,
    draft,
    setActiveClosureTool,
    clearPolygon,
    setClosureName,
    setClosureDescription,
    setClosureType,
    setEndDate,
    finishClosureToolEditing,
    stopEditing,
  } = useClosureEditor();

  const [isSaving, setIsSaving] = useState(false);
  const initialDraftRef = useRef<string>("");
  const latestDraftRef = useRef(draft);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!draft || (mode !== "creating" && mode !== "editing")) {
      initialDraftRef.current = "";
      return;
    }

    initialDraftRef.current = JSON.stringify({
      mode,
      activeClosureId,
      closureName: draft.closureName,
      closureDescription: draft.closureDescription,
      closureType: draft.closureType,
      endDate: draft.endDate?.toISOString() ?? null,
      points: draft.points.map((point) => ({ sequence: point.sequence, point: point.point })),
    });
  }, [activeClosureId, draft, mode]);

  if (!draft || (mode !== "creating" && mode !== "editing")) {
    return null;
  }

  const handleCloseEditor = () => {
    const currentDraftState = JSON.stringify({
      mode,
      activeClosureId,
      closureName: draft.closureName,
      closureDescription: draft.closureDescription,
      closureType: draft.closureType,
      endDate: draft.endDate?.toISOString() ?? null,
      points: draft.points.map((point) => ({ sequence: point.sequence, point: point.point })),
    });

    const isDirty = initialDraftRef.current !== "" && currentDraftState !== initialDraftRef.current;
    if (isDirty) {
      const shouldDiscard = window.confirm("You have unsaved closure changes. Discard and go back?");
      if (!shouldDiscard) {
        return;
      }
    }

    stopEditing();
  };

  const handleSave = async () => {
    if (activeClosureTool === "edit-polygon") {
      // Ensure Geoman commits the latest vertex edits before reading draft for payload.
      finishClosureToolEditing();
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
    }

    const draftToSave = latestDraftRef.current;
    if (!draftToSave) {
      alert("Closure draft is unavailable. Please try again.");
      return;
    }

    const parsed = closurePayloadSchema.safeParse({
      closureName: draftToSave.closureName,
      closureDescription: draftToSave.closureDescription,
      shape: draftToSave.shape || "polygon",
      closureType: draftToSave.closureType,
      endDate: draftToSave.endDate,
      points: draftToSave.points.map((point) => ({
        sequence: point.sequence,
        point: point.point,
      })),
    });

    if (!parsed.success) {
      alert(parsed.error.issues.map((i) => i.message).join("\n"));
      return;
    }

    setIsSaving(true);

    try {
      const fallbackMessage = mode === "editing"
        ? "Failed to update closure region."
        : "Failed to create closure region.";

      if (mode === "creating") {
        const { error } = await $fetch<IApiResponse<ClosureObject>>("/api/restricted/management/closure", {
          method: "POST",
          body: {
            closureName: draftToSave.closureName,
            closureDescription: draftToSave.closureDescription,
            shape: draftToSave.shape || "polygon",
            closureType: draftToSave.closureType,
            endDate: draftToSave.closureType === "scheduled" ? draftToSave.endDate?.toISOString() : undefined,
            points: draftToSave.points.map((point) => ({
              sequence: point.sequence,
              point: point.point,
            })),
          },
        });

        if (error) {
          console.error("Failed to save closure region", error);
          alert(getErrorMessage(error, fallbackMessage));
          return;
        }
      } else if (mode === "editing") {
        if (!activeClosureId) {
          alert("Closure ID is unavailable. Please re-open the editor and try again.");
          return;
        }

        const { error } = await $fetch<IApiResponse<ClosureObject>>(`/api/restricted/management/closure/${activeClosureId}`, {
          method: "PATCH",
          body: {
            closureName: draftToSave.closureName,
            closureDescription: draftToSave.closureDescription,
            shape: draftToSave.shape || "polygon",
            closureType: draftToSave.closureType,
            endDate: draftToSave.closureType === "scheduled" ? draftToSave.endDate?.toISOString() : undefined,
            points: draftToSave.points.map((point) => ({
              sequence: point.sequence,
              point: point.point,
            })),
          },
        });

        if (error) {
          console.error("Failed to save closure region", error);
          alert(getErrorMessage(error, fallbackMessage));
          return;
        }
      }

      await onSaved();
      stopEditing();
    } catch (error) {
      console.error("Failed to save closure region", error);
      alert(getErrorMessage(
        error,
        mode === "editing" ? "Failed to update closure region." : "Failed to create closure region.",
      ));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4 animate-in slide-in-from-left-6 duration-200">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {mode === "creating" ? "Add Road Closure" : "Edit Road Closure"}
            </h2>
            <Badge className="mt-1" variant={mode === "editing" ? "default" : "secondary"}>
              {mode === "editing" ? "Edit Mode" : "Create Mode"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving || draft.points.length < 3}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleCloseEditor}
              aria-label="Back from closure region editor"
              disabled={isSaving}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="closure-name">Closure name</Label>
              <Input
                id="closure-name"
                value={draft.closureName}
                onChange={(event) => setClosureName(event.target.value)}
                placeholder="e.g. Downtown reroute closure"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="closure-description">Description</Label>
              <Textarea
                id="closure-description"
                value={draft.closureDescription}
                onChange={(event) => setClosureDescription(event.target.value)}
                placeholder="Why this closure exists, expected impact, or advisory notes"
                rows={4}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="closure-type">Closure Type</Label>
              <Select
                value={draft.closureType}
                onValueChange={(value: "indefinite" | "scheduled") => {
                  setClosureType(value);
                  if (value === "indefinite") {
                    setEndDate(null);
                  }
                }}
              >
                <SelectTrigger id="closure-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="indefinite">Indefinite</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.closureType === "scheduled" && (
              <div className="grid gap-1.5">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {draft.endDate ? format(draft.endDate, "PPP") : <span className="text-muted-foreground">Pick an end date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={draft.endDate ?? undefined}
                      onSelect={(date) => setEndDate(date ?? null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Use the map shape editor to draw the closure polygon and adjust vertices directly on the map.
            At least 3 points are required to save. Roads inside the region are treated as closed in both directions for vehicles, but remain walkable.
          </p>

          <div className="space-y-3">
            <Label>Closure Tools</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={activeClosureTool === "draw-polygon" ? "secondary" : "outline"}
                onClick={() => setActiveClosureTool("draw-polygon")}
                aria-label="Draw Polygon"
                title="Draw Polygon"
              >
                <PenTool className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!hasDefinedPolygon}
                onClick={clearPolygon}
                aria-label="Erase Polygon"
                title="Erase Polygon"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={finishClosureToolEditing}
                aria-label="Finish Editing"
                title="Finish Editing"
              >
                Done
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
