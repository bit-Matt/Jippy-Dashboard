"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { AppSidebar } from "@/components/app-sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getErrorMessage } from "@/contracts/parsers";
import type { IApiResponse } from "@/lib/http/ApiResponseBuilder";
import { $fetch } from "@/lib/http/client";
import {
  ALGORITHM_WEIGHT_DEFAULTS,
  type AlgorithmWeights,
} from "@/lib/routing-fast";

type WeightFieldProps = {
  label: string;
  field: keyof AlgorithmWeights;
  value: number;
  onChange: (field: keyof AlgorithmWeights, value: number) => void;
  step?: string;
};

function WeightField({ label, field, value, onChange, step }: WeightFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`weight-${field}`} className="text-xs font-normal">
        {label}
      </Label>
      <Input
        id={`weight-${field}`}
        type="number"
        step={step ?? "any"}
        value={value}
        onChange={(event) => {
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

function WeightSection({
  title,
  fields,
  weights,
  onChange,
}: {
  title: string;
  fields: Array<{ label: string; field: keyof AlgorithmWeights; step?: string }>;
  weights: AlgorithmWeights;
  onChange: (field: keyof AlgorithmWeights, value: number) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {fields.map(({ label, field, step }) => (
          <WeightField
            key={field}
            label={label}
            field={field}
            value={weights[field]}
            onChange={onChange}
            step={step}
          />
        ))}
      </div>
    </fieldset>
  );
}

const WEIGHT_SECTIONS: Array<{
  title: string;
  fields: Array<{ label: string; field: keyof AlgorithmWeights; step?: string }>;
}> = [
  {
    title: "Walk",
    fields: [
      { label: "Walk penalty multiplier", field: "walkPenaltyMultiplier" },
      { label: "Walk comfort (m)", field: "walkComfortMeters" },
      { label: "Walk escalation rate", field: "walkEscalationRate" },
      { label: "Walk only threshold (m)", field: "walkOnlyThresholdMeters" },
      { label: "Walk speed (km/h)", field: "walkSpeedKmh" },
      { label: "Walk detour factor", field: "walkDetourFactor" },
      { label: "Long walk threshold (m)", field: "longWalkThresholdMeters" },
    ],
  },
  {
    title: "Transit",
    fields: [
      { label: "Transit cost factor", field: "transitCostFactor" },
      { label: "Transfer penalty (m)", field: "transferPenaltyMeters" },
      { label: "Transfer proximity (m)", field: "transferProximityMeters" },
      { label: "Min transit ride (m)", field: "minTransitRideMeters" },
      { label: "Max transit proximity (m)", field: "maxTransitProximityMeters" },
      { label: "Boarding cost factor", field: "boardingCostFactor" },
      { label: "Closure penalty multiplier", field: "closurePenaltyMultiplier" },
      { label: "Jeepney speed (km/h)", field: "jeepneySpeedKmh" },
      { label: "Stop proximity (m)", field: "stopProximityMeters" },
    ],
  },
  {
    title: "Tricycle",
    fields: [
      { label: "Ride cost factor", field: "tricycleRideCostFactor" },
      { label: "Tricycle speed (km/h)", field: "tricycleSpeedKmh" },
      { label: "Station wait (m)", field: "stationWaitPenaltyMeters" },
      { label: "Hailing wait (m)", field: "hailingWaitPenaltyMeters" },
      { label: "Mid-route tricycle penalty (m)", field: "midRouteTricyclePenaltyMeters" },
      { label: "Short tricycle penalty (m)", field: "shortTricyclePenaltyMeters" },
      { label: "Max station walk (m)", field: "maxTricycleStationWalkMeters" },
      { label: "Min ride (m)", field: "minTricycleRideMeters" },
      { label: "Backtrack multiplier", field: "backtrackPenaltyMultiplier" },
      { label: "Tricycle detour factor", field: "tricycleDetourFactor" },
      { label: "Max walk vs hail (m)", field: "maxDirectWalkInsteadOfHailMeters" },
      { label: "Max ride to transit (m)", field: "maxTricycleRideToTransitMeters" },
      { label: "Max boundary exit walk (m)", field: "maxBoundaryExitWalkMeters" },
      { label: "Max region boundary (m)", field: "maxRegionBoundaryMeters" },
      { label: "Station unavailability threshold", field: "stationUnavailabilityThreshold" },
    ],
  },
  {
    title: "Pricing",
    fields: [
      { label: "Jeepney base fare (₱)", field: "jeepneyBaseFare" },
      { label: "Jeepney base km", field: "jeepneyBaseKm" },
      { label: "Jeepney fare per km (₱)", field: "jeepneyFarePerKm" },
      { label: "Tricycle flat fare (₱)", field: "tricycleFlatFare" },
      { label: "Fare cost weight", field: "fareCostWeight" },
    ],
  },
  {
    title: "Suggestions",
    fields: [
      { label: "Max starting routes", field: "maxStartingRoutes", step: "1" },
      { label: "Max suggestions per route", field: "maxSuggestionsPerStartRoute", step: "1" },
      { label: "Max transfers to show", field: "maxTransfersToShow", step: "1" },
      { label: "Transfer diversity penalty", field: "transferDiversityPenalty" },
    ],
  },
  {
    title: "Graph Builder",
    fields: [
      { label: "Access candidates / direction", field: "accessCandidatesPerDirection", step: "1" },
      { label: "Max access queries", field: "maxAccessQueries", step: "1" },
      { label: "Egress candidates / direction", field: "egressCandidatesPerDirection", step: "1" },
      { label: "Max egress queries", field: "maxEgressQueries", step: "1" },
    ],
  },
];

export default function AlgorithmWeightsPage() {
  const [weights, setWeights] = useState<AlgorithmWeights>(ALGORITHM_WEIGHT_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: weightsResponse, error: loadError, isLoading, mutate } = useSWR<
    { data: IApiResponse<AlgorithmWeights> }
  >("/api/restricted/management/algorithm-weights", $fetch);

  useEffect(() => {
    if (weightsResponse?.data?.ok && weightsResponse.data.data) {
      setWeights(weightsResponse.data.data);
    }
  }, [weightsResponse]);

  const handleChange = useCallback((field: keyof AlgorithmWeights, value: number) => {
    setWeights(current => ({ ...current, [field]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setWeights(ALGORITHM_WEIGHT_DEFAULTS);
    setMessage(null);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    const { data, error: saveError } = await $fetch<IApiResponse<{ message: string }>>(
      "/api/restricted/management/algorithm-weights",
      {
        method: "PUT",
        body: JSON.stringify(weights),
        headers: { "Content-Type": "application/json" },
      },
    );

    setIsSaving(false);

    if (saveError || !data?.ok) {
      setError(getErrorMessage(saveError, "Failed to save algorithm weights."));
      return;
    }

    setMessage("Algorithm weights saved successfully.");
    void mutate();
  }, [weights, mutate]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Card>
            <CardHeader>
              <CardTitle>Algorithm Weights</CardTitle>
              <CardDescription>
                Configure the routing algorithm tunables used by the .NET navigation service.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {(loadError || error) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error ?? getErrorMessage(loadError, "Failed to load algorithm weights.")}
                  </AlertDescription>
                </Alert>
              )}

              {message && (
                <Alert>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading weights...</p>
              ) : (
                <>
                  {WEIGHT_SECTIONS.map(section => (
                    <WeightSection
                      key={section.title}
                      title={section.title}
                      fields={section.fields}
                      weights={weights}
                      onChange={handleChange}
                    />
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Weights"}
                    </Button>
                    <Button variant="outline" onClick={handleReset} disabled={isSaving}>
                      Reset to Defaults
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
