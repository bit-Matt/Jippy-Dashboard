"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, MapPin } from "lucide-react";

const COLORS = [
  "#fff100", "#ff8c00", "#e81123",
  "#ec008c", "#68217a", "#00188f",
  "#00bcf2", "#00b294", "#009e49",
  "#bad80a",
];

export default function RouteEditor() {
  const [editorMode, setEditorMode] = useState<"routes" | "region">("routes");
  const [selectedColor, setSelectedColor] = useState("#fff100");
  const [waypoints, setWaypoints] = useState([{ id: 1, color: "#fff100" }]);

  const handleAddWaypoint = () => {
    setWaypoints((prev) => [
      ...prev,
      { id: prev.length + 1, color: selectedColor },
    ]);
  };

  return (
    <div className="absolute top-2 left-6 z-9999 w-1/4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto px-0 text-base font-semibold">
                {editorMode === "routes" ? "Add Routes" : "Add Region"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={editorMode}
                onValueChange={(value) =>
                  setEditorMode(value as "routes" | "region")
                }
              >
                <DropdownMenuRadioItem value="routes">Add Routes</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="region">Add Region</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {editorMode === "routes" && <Button size="sm">Save</Button>}
        </CardHeader>
        {editorMode === "routes" && (
          <CardContent className="flex max-h-[75vh] flex-col space-y-5 overflow-hidden">
            <div className="space-y-2">
              <Label>Route Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className="relative h-10 w-10 rounded-full border-2 transition-transform hover:scale-105"
                    style={{
                      backgroundColor: color,
                      borderColor: selectedColor === color ? "#111827" : "#e5e7eb",
                    }}
                  >
                    {selectedColor === color && (
                      <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-lg" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1 max-h-[290px] overflow-y-auto">
              {waypoints.map((waypoint, index) => (
                <div
                  key={waypoint.id}
                  className="space-y-3 rounded-lg border border-border bg-background p-3"
                >
                  <InputGroup>
                    <InputGroupInput readOnly value="" placeholder="Address" />
                    <InputGroupAddon align="inline-end" className="pr-2">
                      <InputGroupButton aria-label={`Pin waypoint ${index + 1}`}>
                        <MapPin />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={handleAddWaypoint}>
              + Add waypoint
            </Button>
          </CardContent>
        )}

        {editorMode === "region" && (
          <CardContent>
            <Button className="w-full">Draw region</Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
