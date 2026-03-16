"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";
import type { ClosureLineObject } from "@/lib/management";
import { useClosureEditor } from "@/contexts/ClosureEditorContext";

interface ClosureLineEditorProps {
  onSaved: () => void;
}

export default function ClosureLineEditor({ onSaved }: ClosureLineEditorProps) {
  const {
    mode,
    activeClosureId,
    lineDraft,
    setLineLabel,
    setLineColor,
    setLineDirection,
    stopEditing,
  } = useClosureEditor();

  const [isSaving, setIsSaving] = useState(false);

  if (!lineDraft || (mode !== "creating-line" && mode !== "editing-line")) {
    return null;
  }

  const handleSave = async () => {
    if (lineDraft.points.length < 2) {
      // eslint-disable-next-line no-alert
      alert("Please add at least 2 points for the closure line.");
      return;
    }

    setIsSaving(true);

    try {
      if (mode === "creating-line") {
        await $fetch<IApiResponse<ClosureLineObject>>("/api/restricted/management/closure", {
          method: "POST",
          body: {
            label: lineDraft.label,
            color: lineDraft.color,
            type: "line",
            direction: lineDraft.direction,
            points: lineDraft.points.map(p => ({
              sequence: p.sequence,
              address: p.address,
              point: p.point,
            })),
          },
        });
      } else if (mode === "editing-line" && activeClosureId) {
        await $fetch<IApiResponse<ClosureLineObject>>(`/api/restricted/management/closure/${activeClosureId}`, {
          method: "PATCH",
          body: {
            label: lineDraft.label,
            color: lineDraft.color,
            direction: lineDraft.direction,
            points: lineDraft.points.map(p => ({
              sequence: p.sequence,
              address: p.address,
              point: p.point,
            })),
          },
        });
      }

      onSaved();
      stopEditing();
    } catch (error) {
      console.error("Failed to save closure line", error);
      // eslint-disable-next-line no-alert
      alert("Failed to save closure line.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">
        {mode === "creating-line" ? "Add Road Closure (Line)" : "Edit Road Closure (Line)"}
      </h2>
      <div className="mb-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="closure-line-label">Label</Label>
          <Input
            id="closure-line-label"
            value={lineDraft.label}
            onChange={e => setLineLabel(e.target.value)}
            placeholder="e.g. Temporary closure near Main St."
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="closure-line-color">Color</Label>
          <Input
            id="closure-line-color"
            type="color"
            value={lineDraft.color}
            onChange={e => setLineColor(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Direction</Label>
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="closure-direction"
                checked={lineDraft.direction === "one_way"}
                onChange={() => setLineDirection("one_way")}
              />
              <span>Closed for one way only</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="closure-direction"
                checked={lineDraft.direction === "both"}
                onChange={() => setLineDirection("both")}
              />
              <span>Closed for both ways</span>
            </label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Click on the map to add or adjust points for this closure line. At least 2 points are required.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={stopEditing} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Closure Line"}
        </Button>
      </div>
    </div>
  );
}

