"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
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

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">
        {mode === "creating-region" ? "Add Road Closure (Region)" : "Edit Road Closure (Region)"}
      </h2>
      <div className="mb-4 grid gap-3">
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
        <p className="text-xs text-muted-foreground">
          Click on the map to add or adjust points for this closure region. At least 3 points are required.
          Roads within this region are treated as closed in both directions for vehicles, but remain walkable.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={stopEditing} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Closure Region"}
        </Button>
      </div>
    </div>
  );
}

