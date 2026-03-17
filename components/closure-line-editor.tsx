"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { $fetch } from "@/lib/http/client";
import type { IApiResponse } from "@/lib/http/ResponseComposer";
import type { ClosureLineObject } from "@/lib/management";
import { useClosureEditor } from "@/contexts/ClosureEditorContext";
import * as nominatim from "@/lib/osm/nominatim";

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
    activeLinePointId,
    setActiveLinePointId,
    removeLinePoint,
    setLinePointAddress,
    stopEditing,
  } = useClosureEditor();

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState<Set<string>>(new Set());
  const [lastGeocodedCoords, setLastGeocodedCoords] = useState<Record<string, string>>({});

  const isActive = !!lineDraft && (mode === "creating-line" || mode === "editing-line");

  useEffect(() => {
    if (!isActive || !lineDraft) return;

    const toGeocode = lineDraft.points.filter((p) => {
      const coordKey = `${p.point[0]},${p.point[1]}`;
      return lastGeocodedCoords[p.id] !== coordKey && !loadingAddresses.has(p.id);
    });
    if (toGeocode.length === 0) return;

    setLoadingAddresses((prev) => {
      const next = new Set(prev);
      toGeocode.forEach((p) => next.add(p.id));
      return next;
    });

    (async () => {
      for (const point of toGeocode) {
        const [lat, lng] = point.point;
        const { data, error } = await nominatim.reverse({ lat, lon: lng, zoom: 18 });
        setLinePointAddress(
          point.id,
          error || !data?.display_name ? "Unable to fetch address" : (data.display_name ?? "Unknown location"),
        );
        setLastGeocodedCoords((prev) => ({ ...prev, [point.id]: `${lat},${lng}` }));
        setLoadingAddresses((prev) => {
          const next = new Set(prev);
          next.delete(point.id);
          return next;
        });
      }
    })().catch((e) => {
      console.error("Failed to reverse geocode closure line points", e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, lineDraft?.points]);

  if (!isActive || !lineDraft) {
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

  const handleDelete = async () => {
    if (mode !== "editing-line" || !activeClosureId) return;

    // eslint-disable-next-line no-alert
    const shouldDelete = window.confirm("Delete this road closure? This action cannot be undone.");
    if (!shouldDelete) return;

    setIsDeleting(true);
    try {
      await $fetch(`/api/restricted/management/closure/${activeClosureId}`, { method: "DELETE" });
      onSaved();
      stopEditing();
    } catch (error) {
      console.error("Failed to delete closure line", error);
      // eslint-disable-next-line no-alert
      alert("Failed to delete closure line.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-base font-semibold">
            {mode === "creating-line" ? "Add Road Closure (Line)" : "Edit Road Closure (Line)"}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving || isDeleting || lineDraft.points.length < 2}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={stopEditing}
              aria-label="Close closure line editor"
              disabled={isSaving || isDeleting}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
          <div className="space-y-3">
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
                  <span>One way</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="closure-direction"
                    checked={lineDraft.direction === "both"}
                    onChange={() => setLineDirection("both")}
                  />
                  <span>Both ways</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Points</Label>
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {lineDraft.points.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Click on the map to add points for this closure line. Select a point here to enable dragging it on the map.
                </p>
              ) : (
                [...lineDraft.points]
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((p, idx) => (
                    <div
                      key={p.id}
                      className={`rounded-lg border bg-background p-3 ${
                        activeLinePointId === p.id ? "border-primary" : "border-border"
                      }`}
                      onClick={() => setActiveLinePointId(p.id)}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">Point {idx + 1}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeLinePoint(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        readOnly
                        value={p.address || (loadingAddresses.has(p.id) ? "Loading address..." : "Resolving address...")}
                        title={p.address}
                      />
                    </div>
                  ))
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Add points by clicking the map. Pick a point in the list to drag its marker on the map. At least 2 points are required to save.
          </p>

          {mode === "editing-line" && activeClosureId ? (
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

