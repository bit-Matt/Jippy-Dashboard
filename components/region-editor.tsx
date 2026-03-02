"use client";

import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegionEditor } from "@/contexts/RegionEditorContext";

const COLORS = [
  "#fff100", "#ff8c00", "#e81123",
  "#ec008c", "#68217a", "#00188f",
  "#00bcf2", "#00b294", "#009e49",
  "#bad80a",
];

export default function RegionEditor() {
  const {
    regionName,
    regionColor,
    hasDefinedPolygon,
    setRegionName,
    setRegionColor,
    saveRegionTemplate,
    closeRegionEditor,
  } = useRegionEditor();

  const handleSaveRegion = () => {
    if (!hasDefinedPolygon) {
      console.warn("A polygon or rectangle must be defined before saving.");
      return;
    }

    saveRegionTemplate();
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-base font-semibold">
            Add Region
          </h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveRegion}
              disabled={!hasDefinedPolygon}
            >
              Save
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={closeRegionEditor}
              aria-label="Close region editor"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="region-name">Region Name</Label>
              <Input
                id="region-name"
                placeholder="e.g., Downtown Service Area"
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Region Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setRegionColor(color)}
                  className="relative h-10 w-10 rounded-full border-2 transition-transform hover:scale-105"
                  style={{
                    backgroundColor: color,
                    borderColor: regionColor === color ? "#111827" : "#e5e7eb",
                  }}
                >
                  {regionColor === color && (
                    <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-lg" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Draw a polygon or rectangle on the map to enable save. Region name is shown on the map near the center after shape creation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
