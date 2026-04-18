"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import Simulator from "@/components/simulator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { MultiNavigateRouteResponse, NavigateRouteSuggestion } from "@/contracts/responses";
import type { IApiResponse } from "@/lib/http/ApiResponseBuilder";
import { $fetch } from "@/lib/http/client";
import * as nominatim from "@/lib/osm/nominatim";
import { getErrorMessage } from "@/contracts/parsers";

const SimulatorMapDynamic = dynamic(() => import("./SimulatorMap"), { ssr: false });

export default function SimulatorPage() {
  const [apiVersion, setApiVersion] = useState<"v1" | "v2">("v1");
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null);
  const [startAddress, setStartAddress] = useState("");
  const [endAddress, setEndAddress] = useState("");
  const [pickingMode, setPickingMode] = useState<"start" | "end" | null>(null);
  const [result, setResult] = useState<MultiNavigateRouteResponse | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState<NavigateRouteSuggestion | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApiVersionChange = useCallback((version: "v1" | "v2") => {
    setApiVersion(version);
    setError(null);
    setResult(null);
    setActiveSuggestion(null);
  }, []);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    if (!pickingMode) return;

    const point: [number, number] = [lat, lng];
    const mode = pickingMode;

    // Immediately place marker and reset picking mode
    if (mode === "start") {
      setStartPoint(point);
      setStartAddress("Locating...");
    } else {
      setEndPoint(point);
      setEndAddress("Locating...");
    }
    setPickingMode(null);

    // Reverse geocode in background
    const { data } = await nominatim.reverse({ lat, lon: lng, zoom: 18 });
    const address = data?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    if (mode === "start") {
      setStartAddress(address);
    } else {
      setEndAddress(address);
    }
  }, [pickingMode]);

  const handleSimulate = useCallback(async () => {
    if (!startPoint || !endPoint) return;

    setIsSimulating(true);
    setError(null);
    setResult(null);
    setActiveSuggestion(null);

    const { data, error: fetchError } = await $fetch<IApiResponse<MultiNavigateRouteResponse>>(
      `/api/public/navigate/${apiVersion}`,
      {
        method: "POST",
        body: JSON.stringify({ start: startPoint, end: endPoint }),
        headers: { "Content-Type": "application/json" },
      },
    );

    setIsSimulating(false);

    if (fetchError || !data?.ok) {
      setError(getErrorMessage(fetchError, "Failed to compute route. Please try again."));
      return;
    }

    setResult(data.data);
    setActiveSuggestion(data.data.suggestions[0] ?? null);
  }, [apiVersion, startPoint, endPoint]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="relative h-screen overflow-hidden">
          <SimulatorMapDynamic
            startPoint={startPoint}
            endPoint={endPoint}
            legs={activeSuggestion?.route.legs ?? []}
            globalBbox={activeSuggestion?.route.global_bbox ?? null}
            pickingMode={pickingMode}
            onMapClick={handleMapClick}
          />
          <Simulator
            apiVersion={apiVersion}
            startAddress={startAddress}
            endAddress={endAddress}
            startPoint={startPoint}
            endPoint={endPoint}
            pickingMode={pickingMode}
            isSimulating={isSimulating}
            result={result}
            error={error}
            onApiVersionChange={handleApiVersionChange}
            onPickingModeChange={setPickingMode}
            onSimulate={handleSimulate}
            onSuggestionChange={setActiveSuggestion}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
