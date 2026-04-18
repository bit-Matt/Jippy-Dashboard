"use client";

import { useState } from "react";
import { z } from "zod";
import { AlertCircle, Bike, Bus, Footprints, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  MultiNavigateRouteResponse,
  NavigateRouteLeg,
  NavigateRouteSuggestion,
  NavigateSuggestionLabel,
} from "@/contracts/responses";

const SimulateSchema = z.object({
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
});

const LEG_FALLBACK_COLOR = "#6B7280";

const LEG_ICONS: Record<string, React.ReactNode> = {
  WALK: <Footprints className="h-3 w-3" />,
  JEEPNEY: <Bus className="h-3 w-3" />,
  TRICYCLE: <Bike className="h-3 w-3" />,
};

const LABEL_DISPLAY: Record<NavigateSuggestionLabel, string> = {
  fastest: "Fastest",
  least_walking: "Less Walk",
  simplest: "Simplest",
  explorer: "Explorer",
  tricycle: "Tricycle",
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function LegCard({ leg }: { leg: NavigateRouteLeg }) {
  const color = leg.color ?? LEG_FALLBACK_COLOR;
  return (
    <div
      className="rounded-lg border border-border bg-background overflow-hidden"
      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="flex items-center gap-1">
            {LEG_ICONS[leg.type]}
            {leg.type}
          </Badge>
          {leg.route_name && (
            <span className="text-sm font-medium">{leg.route_name}</span>
          )}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{formatDistance(leg.distance)}</span>
          <span>{formatDuration(leg.duration)}</span>
        </div>
        {leg.instructions.length > 0 && (
          <ol className="space-y-1 list-none pl-0">
            {leg.instructions.map((instruction, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{instruction.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function SuggestionPanel({ suggestion }: { suggestion: NavigateRouteSuggestion }) {
  const { route } = suggestion;
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{formatDistance(route.total_distance)}</span>
        <span>{formatDuration(route.total_duration)}</span>
        <span>
          {route.total_transfers} transfer{route.total_transfers !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {route.legs.map((leg, i) => (
          <LegCard key={i} leg={leg} />
        ))}
      </div>
    </div>
  );
}

export interface SimulatorProps {
  apiVersion: "v1" | "v2";
  startAddress: string;
  endAddress: string;
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  pickingMode: "start" | "end" | null;
  isSimulating: boolean;
  result: MultiNavigateRouteResponse | null;
  error: string | null;
  onApiVersionChange: (version: "v1" | "v2") => void;
  onPickingModeChange: (mode: "start" | "end" | null) => void;
  onSimulate: () => void;
  onSuggestionChange: (suggestion: NavigateRouteSuggestion | null) => void;
}

export default function Simulator({
  apiVersion,
  startAddress,
  endAddress,
  startPoint,
  endPoint,
  pickingMode,
  isSimulating,
  result,
  error,
  onApiVersionChange,
  onPickingModeChange,
  onSimulate,
  onSuggestionChange,
}: SimulatorProps) {
  const [activeTab, setActiveTab] = useState<string>("");

  const validation = SimulateSchema.safeParse({ start: startPoint, end: endPoint });
  const canSimulate = validation.success && !isSimulating;

  const handleStartPin = () => {
    onPickingModeChange(pickingMode === "start" ? null : "start");
  };

  const handleEndPin = () => {
    onPickingModeChange(pickingMode === "end" ? null : "end");
  };

  const handleTabChange = (label: string) => {
    setActiveTab(label);
    const suggestion = result?.suggestions.find((s) => s.label === label) ?? null;
    onSuggestionChange(suggestion);
  };

  // When a new result arrives, auto-select the first suggestion
  const firstLabel = result?.suggestions[0]?.label ?? "";
  if (result && firstLabel && activeTab !== firstLabel && !result.suggestions.find((s) => s.label === activeTab)) {
    setActiveTab(firstLabel);
    onSuggestionChange(result.suggestions[0]);
  }

  return (
    <div className="absolute top-2 left-6 z-99999 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <Card>
        <CardHeader>
          <CardTitle>Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="simulator-api-version">API Version</Label>
            <NativeSelect
              id="simulator-api-version"
              value={apiVersion}
              onChange={(event) => onApiVersionChange(event.target.value as "v1" | "v2")}
              className="w-full"
            >
              <NativeSelectOption value="v1">/api/public/navigate/v1 - Stable</NativeSelectOption>
              <NativeSelectOption value="v2">/api/public/navigate/v2 - Beta (.NET 10 router-fast)</NativeSelectOption>
            </NativeSelect>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Start</Label>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value={startAddress}
                  placeholder="Click the pin to pick a starting point"
                />
                <InputGroupAddon align="inline-end" className="pr-2">
                  <InputGroupButton
                    aria-label="Pin start location"
                    onClick={handleStartPin}
                    className={pickingMode === "start" ? "text-primary" : ""}
                  >
                    <MapPin />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value={endAddress}
                  placeholder="Click the pin to pick a destination"
                />
                <InputGroupAddon align="inline-end" className="pr-2">
                  <InputGroupButton
                    aria-label="Pin destination location"
                    onClick={handleEndPin}
                    className={pickingMode === "end" ? "text-primary" : ""}
                  >
                    <MapPin />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>

          {pickingMode && (
            <p className="text-xs text-muted-foreground text-center">
              Click on the map to set the{" "}
              {pickingMode === "start" ? "starting point" : "destination"}
            </p>
          )}

          <Button
            className="w-full"
            onClick={onSimulate}
            disabled={!canSimulate}
          >
            {isSimulating ? "Simulating..." : "Simulate"}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && result.suggestions.length > 0 && (
            <>
              <Separator />
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="w-full">
                  {result.suggestions.map((s) => (
                    <TabsTrigger key={s.label} value={s.label} className="flex-1 text-xs">
                      {LABEL_DISPLAY[s.label] ?? s.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {result.suggestions.map((s) => (
                  <TabsContent key={s.label} value={s.label} className="mt-3">
                    <SuggestionPanel suggestion={s} />
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
