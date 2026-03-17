"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";
import type { ClosureRegionObject } from "@/lib/management";
import { useClosureEditor } from "@/contexts/ClosureEditorContext";

interface ClosureRegionEditorProps {
  onSaved: () => void;
}

export default function ClosureRegionEditor({ onSaved }: ClosureRegionEditorProps) {
  const {
    mode,
    activeClosureId,
    regionDraft,
    setRegionLabel,
    setRegionColor,
    stopEditing,
  } = useClosureEditor();

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!regionDraft || (mode !== "creating-region" && mode !== "editing-region")) {
    return null;
  }

  const handleSave = async () => {
    if (regionDraft.points.length < 3) {
      // eslint-disable-next-line no-alert
      alert("Please add at least 3 points for the closure region.");
      return;
    }

    setIsSaving(true);

    try {
      if (mode === "creating-region") {
        await $fetch<IApiResponse<ClosureRegionObject>>("/api/restricted/management/closure", {
          method: "POST",
          body: {
            label: regionDraft.label,
            color: regionDraft.color,
            type: "region",
            points: regionDraft.points.map(p => ({
              sequence: p.sequence,
              point: p.point,
            })),
          },
        });
      } else if (mode === "editing-region" && activeClosureId) {
        await $fetch<IApiResponse<ClosureRegionObject>>(`/api/restricted/management/closure/${activeClosureId}`, {
          method: "PATCH",
          body: {
            label: regionDraft.label,
            color: regionDraft.color,
            points: regionDraft.points.map(p => ({
              sequence: p.sequence,
              point: p.point,
            })),
          },
        });
      }

      onSaved();
      stopEditing();
    } catch (error) {
      console.error("Failed to save closure region", error);
      // eslint-disable-next-line no-alert
      alert("Failed to save closure region.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (mode !== "editing-region" || !activeClosureId) return;

    // eslint-disable-next-line no-alert
    const shouldDelete = window.confirm("Delete this road closure? This action cannot be undone.");
    if (!shouldDelete) return;

    setIsDeleting(true);
    try {
      await $fetch(`/api/restricted/management/closure/${activeClosureId}`, { method: "DELETE" });
      onSaved();
      stopEditing();
    } catch (error) {
      console.error("Failed to delete closure region", error);
      // eslint-disable-next-line no-alert
      alert("Failed to delete closure region.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-base font-semibold">
            {mode === "creating-region" ? "Add Road Closure (Region)" : "Edit Road Closure (Region)"}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving || isDeleting || regionDraft.points.length < 3}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={stopEditing}
              aria-label="Close closure region editor"
              disabled={isSaving || isDeleting}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="closure-region-label">Label</Label>
              <Input
                id="closure-region-label"
                value={regionDraft.label}
                onChange={e => setRegionLabel(e.target.value)}
                placeholder="e.g. Event closure area"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="closure-region-color">Color</Label>
              <Input
                id="closure-region-color"
                type="color"
                value={regionDraft.color}
                onChange={e => setRegionColor(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Use the map shape editor (polygon/rectangle) to draw the closure area. Edit vertices directly on the map.
            At least 3 points are required to save. Roads inside the region are treated as closed in both directions for vehicles, but remain walkable.
          </p>

          {mode === "editing-region" && activeClosureId ? (
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => {
                void handleDelete();
              }}
              disabled={isSaving || isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Closure"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

