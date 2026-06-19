"use client";

import { useEffect, useState } from "react";

import type { StopResponse } from "@/contracts/responses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface TransitStopDraftSidebarProps {
  mode: "create" | "edit";
  point: [number, number];
  stop?: StopResponse;
  userRole: string | null;
  isSaving: boolean;
  isDeletingStop?: boolean;
  onCancel: () => void;
  onSave: (payload: { point: [number, number]; number?: number; isPublic: boolean }) => Promise<void>;
  onDeleteStop?: () => void;
}

async function fetchAddressForPoint(point: [number, number]): Promise<string> {
  const [lat, lon] = point;

  try {
    const response = await fetch(
      `/api/public/nominatim/reverse?lat=${lat}&lon=${lon}&format=json`,
    );

    if (!response.ok) {
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }

    const data = await response.json() as { display_name?: string };
    return data.display_name ?? `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}

export default function TransitStopDraftSidebar({
  mode,
  point,
  stop,
  userRole,
  isSaving,
  isDeletingStop = false,
  onCancel,
  onSave,
  onDeleteStop,
}: TransitStopDraftSidebarProps) {
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [stopNumber, setStopNumber] = useState(mode === "edit" && stop ? String(stop.number) : "");
  const [isPublic, setIsPublic] = useState(mode === "edit" && stop ? stop.isPublic : false);

  const isAdministrator = userRole === "administrator_user";

  useEffect(() => {
    if (mode === "edit" && stop) {
      setStopNumber(String(stop.number));
      setIsPublic(stop.isPublic);
    }
  }, [mode, stop]);

  useEffect(() => {
    let cancelled = false;

    const loadAddress = async () => {
      setIsGeocoding(true);
      const nextAddress = await fetchAddressForPoint(point);
      if (!cancelled) {
        setAddress(nextAddress);
        setIsGeocoding(false);
      }
    };

    void loadAddress();

    return () => {
      cancelled = true;
    };
  }, [point]);

  const handleSave = async () => {
    const parsedNumber = stopNumber.trim() ? Number.parseInt(stopNumber, 10) : undefined;
    if (stopNumber.trim() && (!parsedNumber || parsedNumber <= 0)) {
      alert("Stop number must be a positive integer.");
      return;
    }

    await onSave({
      point,
      number: parsedNumber,
      isPublic: isAdministrator ? isPublic : false,
    });
  };

  return (
    <Card>
      <CardHeader className="gap-1 pb-2">
        <CardTitle className="text-base">{mode === "create" ? "New Stop" : "Edit Stop"}</CardTitle>
        <p className="text-muted-foreground text-sm">
          Drag the marker to adjust the location.
        </p>
      </CardHeader>
      <CardContent className="max-h-[75vh] space-y-3 overflow-y-auto">
        <div className="space-y-1 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Address</p>
          <p className="text-sm font-medium">
            {isGeocoding ? "Looking up address..." : address || "—"}
          </p>
        </div>

        <div className="space-y-1 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Coordinates</p>
          <p className="text-sm font-medium">
            {point[0].toFixed(6)}, {point[1].toFixed(6)}
          </p>
        </div>

        <div className="space-y-1.5 rounded-md border p-3">
          <Label htmlFor="draft-stop-number">Stop number{mode === "create" ? " (optional)" : ""}</Label>
          <Input
            id="draft-stop-number"
            type="number"
            min={1}
            value={stopNumber}
            onChange={(event) => setStopNumber(event.target.value)}
            placeholder={mode === "create" ? "Auto-assigned if left blank" : undefined}
          />
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Public Visibility</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${isPublic ? "text-emerald-700" : "text-amber-700"}`}>
                {isPublic ? "Published" : "Unpublished"}
              </p>
              <p className="text-muted-foreground text-xs">
                {isPublic
                  ? mode === "create"
                    ? "Will be visible in public-facing map data after saving."
                    : "Visible in public-facing map data."
                  : "Only visible in management tools."}
              </p>
            </div>
            {isAdministrator ? (
              <Switch
                checked={isPublic}
                disabled={isSaving || isGeocoding}
                onCheckedChange={setIsPublic}
                aria-label="Toggle stop visibility"
              />
            ) : null}
          </div>
          {!isAdministrator ? (
            <p className="text-muted-foreground text-xs">Only administrators can publish stops.</p>
          ) : null}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={isSaving || isDeletingStop}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving || isGeocoding || isDeletingStop}
          >
            {isSaving ? "Saving..." : mode === "create" ? "Save Stop" : "Save Changes"}
          </Button>
        </div>

        {mode === "edit" && onDeleteStop ? (
          <>
            <Separator />
            <Button
              type="button"
              className="w-full"
              variant="destructive"
              onClick={onDeleteStop}
              disabled={isDeletingStop || isSaving || isGeocoding || (stop?.isPublic && !isAdministrator)}
            >
              {isDeletingStop ? "Deleting Stop..." : "Delete Stop"}
            </Button>
            {!isAdministrator && stop?.isPublic ? (
              <p className="text-muted-foreground text-xs">Only administrators can delete published stops.</p>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
