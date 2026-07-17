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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  MultiNavigateRouteResponse,
  NavigateRouteLeg,
  NavigateRouteSuggestion,
} from "@/contracts/responses";
import type { SimulationOverrides } from "@/lib/routing-fast";
import { SIMULATION_OVERRIDE_DEFAULTS } from "@/lib/routing-fast";

const SimulateSchema = z.object({
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
});

export type SimulatorApiVersion = "v2" | "v2.5" | "v3";

export const SIMULATOR_API_VERSION_OPTIONS: {
  value: SimulatorApiVersion;
  label: string;
}[] = [
  { value: "v2", label: "/api/restricted/navigate/v2/simulate - Stable" },
  { value: "v3", label: "/api/restricted/navigate/v3/simulate - Alpha (Stop-based)" },
];

const LEG_FALLBACK_COLOR = "#6B7280";

const LEG_ICONS: Record<string, React.ReactNode> = {
  WALK: <Footprints className="h-3 w-3" />,
  WALK_TRICYCLE: <Footprints className="h-3 w-3" />,
  JEEPNEY: <Bus className="h-3 w-3" />,
  TRICYCLE: <Bike className="h-3 w-3" />,
};

function formatSuggestionLabel(label: string, totalTransfers?: number): string {
  if (totalTransfers != null) {
    if (totalTransfers === 0) return "Direct";
    if (totalTransfers === 1) return "1 Transfer";
    return `${totalTransfers} Transfers`;
  }
  if (label === "direct") return "Direct";
  if (label === "1_transfer") return "1 Transfer";
  const transfersMatch = label.match(/^(\d+)_transfers$/);
  if (transfersMatch) {
    const count = Number(transfersMatch[1]);
    return `${count} Transfers`;
  }
  return label;
}

function formatSuggestionOptionLabel(
  suggestion: NavigateRouteSuggestion,
  suggestions: NavigateRouteSuggestion[],
): string {
  const base = formatSuggestionLabel(suggestion.label, suggestion.route.total_transfers);
  const hasDuplicateLabel = suggestions.filter((s) => s.label === suggestion.label).length > 1;
  if (!hasDuplicateLabel) return base;
  return `${base} · ${formatDuration(suggestion.route.total_duration)} · ${formatDistance(suggestion.route.total_distance)}`;
}

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

function formatFare(pesos: number): string {
  return `₱${pesos.toFixed(2)}`;
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
            <span className="text-sm font-medium">
              {leg.route_number ? `${leg.route_number} — ` : ""}
              {leg.route_name}
            </span>
          )}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{formatDistance(leg.distance)}</span>
          <span>{formatDuration(leg.duration)}</span>
          <span>{formatFare(leg.fare ?? 0)}</span>
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

function OverrideField({
  label,
  field,
  value,
  defaultValue,
  onChange,
  step,
}: {
  label: string;
  field: keyof SimulationOverrides;
  value: number | undefined;
  defaultValue: number;
  onChange: (field: keyof SimulationOverrides, value: number | undefined) => void;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`override-${field}`} className="text-xs font-normal">
        {label}
      </Label>
      <Input
        id={`override-${field}`}
        type="number"
        step={step ?? "any"}
        placeholder={String(defaultValue)}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(field, undefined);
            return;
          }
          const parsed = event.target.valueAsNumber;
          if (!Number.isNaN(parsed)) {
            onChange(field, parsed);
          }
        }}
        className="h-8 text-xs"
      />
    </div>
  );
}

function WeightOverridesPanel({
  overrides,
  onOverridesChange,
}: {
  overrides: SimulationOverrides;
  onOverridesChange: (overrides: SimulationOverrides) => void;
}) {
  const setOverride = (field: keyof SimulationOverrides, value: number | undefined) => {
    const next = { ...overrides };
    if (value === undefined) {
      delete next[field];
    } else {
      next[field] = value;
    }
    onOverridesChange(next);
  };

  const defaults = SIMULATION_OVERRIDE_DEFAULTS;

  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium select-none">
        Weight Overrides
      </summary>
      <div className="space-y-4 border-t border-border px-3 py-3">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">Weights &amp; Penalties</legend>
          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="Walk penalty multiplier" field="walkPenaltyMultiplier" value={overrides.walkPenaltyMultiplier} defaultValue={defaults.walkPenaltyMultiplier} onChange={setOverride} />
            <OverrideField label="Walk comfort (m)" field="walkComfortMeters" value={overrides.walkComfortMeters} defaultValue={defaults.walkComfortMeters} onChange={setOverride} />
            <OverrideField label="Walk escalation rate" field="walkEscalationRate" value={overrides.walkEscalationRate} defaultValue={defaults.walkEscalationRate} onChange={setOverride} />
            <OverrideField label="Transfer penalty (m)" field="transferPenaltyMeters" value={overrides.transferPenaltyMeters} defaultValue={defaults.transferPenaltyMeters} onChange={setOverride} />
            <OverrideField label="Closure penalty multiplier" field="closurePenaltyMultiplier" value={overrides.closurePenaltyMultiplier} defaultValue={defaults.closurePenaltyMultiplier} onChange={setOverride} />
            <OverrideField label="Boarding cost factor" field="boardingCostFactor" value={overrides.boardingCostFactor} defaultValue={defaults.boardingCostFactor} onChange={setOverride} />
            <OverrideField label="Stop snap (m)" field="stopSnapMeters" value={overrides.stopSnapMeters} defaultValue={defaults.stopSnapMeters} onChange={setOverride} />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">Transit</legend>
          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="Transit cost factor" field="transitCostFactor" value={overrides.transitCostFactor} defaultValue={defaults.transitCostFactor} onChange={setOverride} />
            <OverrideField label="Min transit ride (m)" field="minTransitRideMeters" value={overrides.minTransitRideMeters} defaultValue={defaults.minTransitRideMeters} onChange={setOverride} />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">Tricycle</legend>
          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="Ride cost factor" field="tricycleRideCostFactor" value={overrides.tricycleRideCostFactor} defaultValue={defaults.tricycleRideCostFactor} onChange={setOverride} />
            <OverrideField label="Station wait (m)" field="stationWaitPenaltyMeters" value={overrides.stationWaitPenaltyMeters} defaultValue={defaults.stationWaitPenaltyMeters} onChange={setOverride} />
            <OverrideField label="Hailing wait (m)" field="hailingWaitPenaltyMeters" value={overrides.hailingWaitPenaltyMeters} defaultValue={defaults.hailingWaitPenaltyMeters} onChange={setOverride} />
            <OverrideField label="Mid-route tricycle penalty (m)" field="midRouteTricyclePenaltyMeters" value={overrides.midRouteTricyclePenaltyMeters} defaultValue={defaults.midRouteTricyclePenaltyMeters} onChange={setOverride} />
            <OverrideField label="Short tricycle penalty (m)" field="shortTricyclePenaltyMeters" value={overrides.shortTricyclePenaltyMeters} defaultValue={defaults.shortTricyclePenaltyMeters} onChange={setOverride} />
            <OverrideField label="Max station walk (m)" field="maxTricycleStationWalkMeters" value={overrides.maxTricycleStationWalkMeters} defaultValue={defaults.maxTricycleStationWalkMeters} onChange={setOverride} />
            <OverrideField label="Min ride (m)" field="minTricycleRideMeters" value={overrides.minTricycleRideMeters} defaultValue={defaults.minTricycleRideMeters} onChange={setOverride} />
            <OverrideField label="Backtrack multiplier" field="backtrackPenaltyMultiplier" value={overrides.backtrackPenaltyMultiplier} defaultValue={defaults.backtrackPenaltyMultiplier} onChange={setOverride} />
            <OverrideField label="Tricycle detour factor" field="tricycleDetourFactor" value={overrides.tricycleDetourFactor} defaultValue={defaults.tricycleDetourFactor} onChange={setOverride} />
            <OverrideField label="Walk detour factor" field="walkDetourFactor" value={overrides.walkDetourFactor} defaultValue={defaults.walkDetourFactor} onChange={setOverride} />
            <OverrideField label="Max walk vs hail (m)" field="maxDirectWalkInsteadOfHailMeters" value={overrides.maxDirectWalkInsteadOfHailMeters} defaultValue={defaults.maxDirectWalkInsteadOfHailMeters} onChange={setOverride} />
            <OverrideField label="Max ride to transit (m)" field="maxTricycleRideToTransitMeters" value={overrides.maxTricycleRideToTransitMeters} defaultValue={defaults.maxTricycleRideToTransitMeters} onChange={setOverride} />
            <OverrideField label="Max boundary exit walk (m)" field="maxBoundaryExitWalkMeters" value={overrides.maxBoundaryExitWalkMeters} defaultValue={defaults.maxBoundaryExitWalkMeters} onChange={setOverride} />
            <OverrideField label="Max region boundary (m)" field="maxRegionBoundaryMeters" value={overrides.maxRegionBoundaryMeters} defaultValue={defaults.maxRegionBoundaryMeters} onChange={setOverride} />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">Pricing</legend>
          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="Jeepney base fare (₱)" field="jeepneyBaseFare" value={overrides.jeepneyBaseFare} defaultValue={defaults.jeepneyBaseFare} onChange={setOverride} />
            <OverrideField label="Jeepney base km" field="jeepneyBaseKm" value={overrides.jeepneyBaseKm} defaultValue={defaults.jeepneyBaseKm} onChange={setOverride} />
            <OverrideField label="Jeepney fare per km (₱)" field="jeepneyFarePerKm" value={overrides.jeepneyFarePerKm} defaultValue={defaults.jeepneyFarePerKm} onChange={setOverride} />
            <OverrideField label="Tricycle flat fare (₱)" field="tricycleFlatFare" value={overrides.tricycleFlatFare} defaultValue={defaults.tricycleFlatFare} onChange={setOverride} />
            <OverrideField label="Fare cost weight" field="fareCostWeight" value={overrides.fareCostWeight} defaultValue={defaults.fareCostWeight} onChange={setOverride} />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">Suggestions</legend>
          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="Max starting routes" field="maxStartingRoutes" value={overrides.maxStartingRoutes} defaultValue={defaults.maxStartingRoutes} onChange={setOverride} step="1" />
            <OverrideField label="Max suggestions per route" field="maxSuggestionsPerStartRoute" value={overrides.maxSuggestionsPerStartRoute} defaultValue={defaults.maxSuggestionsPerStartRoute} onChange={setOverride} step="1" />
            <OverrideField label="Max transfers to show" field="maxTransfersToShow" value={overrides.maxTransfersToShow} defaultValue={defaults.maxTransfersToShow} onChange={setOverride} step="1" />
            <OverrideField label="Transfer diversity penalty" field="transferDiversityPenalty" value={overrides.transferDiversityPenalty} defaultValue={defaults.transferDiversityPenalty} onChange={setOverride} />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">Graph Builder</legend>
          <div className="grid grid-cols-2 gap-2">
            <OverrideField label="Access candidates / direction" field="accessCandidatesPerDirection" value={overrides.accessCandidatesPerDirection} defaultValue={defaults.accessCandidatesPerDirection} onChange={setOverride} step="1" />
            <OverrideField label="Max access queries" field="maxAccessQueries" value={overrides.maxAccessQueries} defaultValue={defaults.maxAccessQueries} onChange={setOverride} step="1" />
            <OverrideField label="Egress candidates / direction" field="egressCandidatesPerDirection" value={overrides.egressCandidatesPerDirection} defaultValue={defaults.egressCandidatesPerDirection} onChange={setOverride} step="1" />
            <OverrideField label="Max egress queries" field="maxEgressQueries" value={overrides.maxEgressQueries} defaultValue={defaults.maxEgressQueries} onChange={setOverride} step="1" />
          </div>
        </fieldset>
      </div>
    </details>
  );
}

function SuggestionPanel({ suggestion }: { suggestion: NavigateRouteSuggestion }) {
  const { route } = suggestion;
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{formatDistance(route.total_distance)}</span>
        <span>{formatDuration(route.total_duration)}</span>
        <span>{formatFare(route.total_fare ?? route.legs.reduce((sum, leg) => sum + (leg.fare ?? 0), 0))}</span>
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
  apiVersion: SimulatorApiVersion;
  startAddress: string;
  endAddress: string;
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  pickingMode: "start" | "end" | null;
  isSimulating: boolean;
  result: MultiNavigateRouteResponse | null;
  error: string | null;
  overrides: SimulationOverrides;
  onApiVersionChange: (version: SimulatorApiVersion) => void;
  onPickingModeChange: (mode: "start" | "end" | null) => void;
  onSimulate: () => void;
  onSuggestionChange: (suggestion: NavigateRouteSuggestion | null) => void;
  onOverridesChange: (overrides: SimulationOverrides) => void;
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
  overrides,
  onApiVersionChange,
  onPickingModeChange,
  onSimulate,
  onSuggestionChange,
  onOverridesChange,
}: SimulatorProps) {
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<string>("");
  const [prevResult, setPrevResult] = useState(result);

  if (result !== prevResult) {
    setPrevResult(result);
    if (!result?.suggestions.length) {
      setActiveSuggestionIndex("");
    } else {
      setActiveSuggestionIndex((current) => {
        const index = Number(current);
        return Number.isInteger(index) && index >= 0 && index < result.suggestions.length
          ? current
          : "0";
      });
    }
  }

  const validation = SimulateSchema.safeParse({ start: startPoint, end: endPoint });
  const canSimulate = validation.success && !isSimulating;

  const handleStartPin = () => {
    onPickingModeChange(pickingMode === "start" ? null : "start");
  };

  const handleEndPin = () => {
    onPickingModeChange(pickingMode === "end" ? null : "end");
  };

  const handleSuggestionIndexChange = (index: string) => {
    setActiveSuggestionIndex(index);
    const suggestion = result?.suggestions[Number(index)] ?? null;
    onSuggestionChange(suggestion);
  };

  const activeSuggestion = result?.suggestions[Number(activeSuggestionIndex)];

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
              onChange={(event) => onApiVersionChange(event.target.value as SimulatorApiVersion)}
              className="w-full"
            >
              {SIMULATOR_API_VERSION_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
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

          {(apiVersion === "v2" || apiVersion === "v3") && (
            <WeightOverridesPanel
              overrides={overrides}
              onOverridesChange={onOverridesChange}
            />
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
              <div className="space-y-3">
                <Select
                  value={activeSuggestionIndex}
                  onValueChange={handleSuggestionIndexChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="z-[100000]">
                    {result.suggestions.map((s, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {formatSuggestionOptionLabel(s, result.suggestions)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeSuggestion && <SuggestionPanel suggestion={activeSuggestion} />}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
