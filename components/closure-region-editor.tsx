"use client";

import { PenTool, Trash2, X } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";
import type { ClosureObject } from "@/lib/management/index";
import { useClosureEditor } from "@/contexts/ClosureEditorContext";

interface ClosureRegionEditorProps {
  onSaved: () => void;
}

const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    const errorRecord = error as {
      message?: unknown;
      title?: unknown;
      details?: { message?: unknown } | unknown;
    };

    if (typeof errorRecord.message === "string" && errorRecord.message.trim().length > 0) {
      return errorRecord.message;
    }

    if (
      errorRecord.details &&
      typeof errorRecord.details === "object" &&
      "message" in errorRecord.details &&
      typeof errorRecord.details.message === "string" &&
      errorRecord.details.message.trim().length > 0
    ) {
      return errorRecord.details.message;
    }

    if (typeof errorRecord.title === "string" && errorRecord.title.trim().length > 0) {
      return errorRecord.title;
    }
  }

  return fallbackMessage;
};

export default function ClosureRegionEditor({ onSaved }: ClosureRegionEditorProps) {
  const {
    mode,
    activeClosureId,
    activeSnapshotId,
    activeClosureTool,
    hasDefinedPolygon,
    draft,
    setActiveClosureTool,
    clearPolygon,
    setClosureName,
    setClosureDescription,
    setVersionName,
    setSnapshotState,
    finishClosureToolEditing,
    stopEditing,
  } = useClosureEditor();
  const { data: me } = useSWR<MeResponse>("/api/me", $fetch);
  const isAdministrator = me?.data?.data?.role === "administrator_user";

  const [isSaving, setIsSaving] = useState(false);

  if (!draft || (mode !== "creating" && mode !== "editing")) {
    return null;
  }

  const handleSave = async () => {
    if (draft.points.length < 3) {
      alert("Please add at least 3 points for the closure region.");
      return;
    }

    setIsSaving(true);

    try {
      const fallbackMessage = mode === "editing"
        ? "Failed to update closure region."
        : "Failed to create closure region.";

      if (mode === "creating") {
        const endpoint = activeClosureId
          ? `/api/restricted/management/closure/${activeClosureId}`
          : "/api/restricted/management/closure";
        const { error } = await $fetch<IApiResponse<ClosureObject>>(endpoint, {
          method: "POST",
          body: {
            versionName: draft.versionName,
            snapshotState: draft.snapshotState,
            closureName: draft.closureName,
            closureDescription: draft.closureDescription,
            shape: draft.shape || "polygon",
            points: draft.points.map(p => ({
              sequence: p.sequence,
              point: p.point,
            })),
          },
        });

        if (error) {
          console.error("Failed to save closure region", error);
          alert(getErrorMessage(error, fallbackMessage));
          return;
        }
      } else if (mode === "editing" && activeClosureId && activeSnapshotId) {
        const { error } = await $fetch<IApiResponse<ClosureObject>>(`/api/restricted/management/closure/${activeClosureId}/${activeSnapshotId}`, {
          method: "PATCH",
          body: {
            versionName: draft.versionName,
            snapshotState: draft.snapshotState,
            closureName: draft.closureName,
            closureDescription: draft.closureDescription,
            shape: draft.shape || "polygon",
            points: draft.points.map(p => ({
              sequence: p.sequence,
              point: p.point,
            })),
          },
        });

        if (error) {
          console.error("Failed to save closure region", error);
          alert(getErrorMessage(error, fallbackMessage));
          return;
        }
      }

      onSaved();
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
    <div className="absolute top-2 left-6 z-9999 w-1/4">
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
              size="icon"
              variant="ghost"
              onClick={stopEditing}
              aria-label="Close closure region editor"
              disabled={isSaving}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="closure-version-name">Version Name</Label>
              <Input
                id="closure-version-name"
                value={draft.versionName}
                onChange={e => setVersionName(e.target.value)}
                placeholder="e.g. v1"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Snapshot State</Label>
              <Select
                value={draft.snapshotState}
                onValueChange={(value) => setSnapshotState(value as "wip" | "for_approval" | "ready")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select snapshot state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wip">WIP</SelectItem>
                  <SelectItem value="for_approval">For Approval</SelectItem>
                  {isAdministrator ? <SelectItem value="ready">Ready</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="closure-name">Closure name</Label>
              <Input
                id="closure-name"
                value={draft.closureName}
                onChange={e => setClosureName(e.target.value)}
                placeholder="e.g. Downtown reroute closure"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="closure-description">Description</Label>
              <Textarea
                id="closure-description"
                value={draft.closureDescription}
                onChange={e => setClosureDescription(e.target.value)}
                placeholder="Why this closure exists, expected impact, or advisory notes"
                rows={4}
              />
            </div>
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

type MeResponse = {
  data: {
    ok: boolean;
    data: {
      role: string;
    };
  };
  error?: unknown;
}

