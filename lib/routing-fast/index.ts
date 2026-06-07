import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { MultiNavigateResponse } from "@/lib/routing/types";
import { utils } from "@/lib/validator";

export type SimulationOverrides = {
  walkPenaltyMultiplier?: number;
  walkComfortMeters?: number;
  walkEscalationRate?: number;
  transferPenaltyMeters?: number;
  closurePenaltyMultiplier?: number;
  boardingCostFactor?: number;
  transitCostFactor?: number;
  minTransitRideMeters?: number;
  tricycleRideCostFactor?: number;
  stationWaitPenaltyMeters?: number;
  hailingWaitPenaltyMeters?: number;
  maxTricycleStationWalkMeters?: number;
  minTricycleRideMeters?: number;
  backtrackPenaltyMultiplier?: number;
  tricycleDetourFactor?: number;
  walkDetourFactor?: number;
  maxDirectWalkInsteadOfHailMeters?: number;
  maxTricycleRideToTransitMeters?: number;
  maxBoundaryExitWalkMeters?: number;
  maxRegionBoundaryMeters?: number;
  explorerDiversityPenalty?: number;
  explorerMaxTransfers?: number;
  explorerDurationCap?: number;
  accessCandidatesPerDirection?: number;
  maxAccessQueries?: number;
  egressCandidatesPerDirection?: number;
  maxEgressQueries?: number;
};

/** Default values mirrored from the .NET RoutingConstants for UI placeholders. */
export const SIMULATION_OVERRIDE_DEFAULTS: Required<SimulationOverrides> = {
  walkPenaltyMultiplier: 2.0,
  walkComfortMeters: 150,
  walkEscalationRate: 0.008,
  transferPenaltyMeters: 120,
  closurePenaltyMultiplier: 5.0,
  boardingCostFactor: 0.25,
  transitCostFactor: 0.5,
  minTransitRideMeters: 300,
  tricycleRideCostFactor: 0.3,
  stationWaitPenaltyMeters: 350,
  hailingWaitPenaltyMeters: 525,
  maxTricycleStationWalkMeters: 1_000,
  minTricycleRideMeters: 150,
  backtrackPenaltyMultiplier: 2.0,
  tricycleDetourFactor: 1.2,
  walkDetourFactor: 1.5,
  maxDirectWalkInsteadOfHailMeters: 500,
  maxTricycleRideToTransitMeters: 600,
  maxBoundaryExitWalkMeters: 500,
  maxRegionBoundaryMeters: 300,
  explorerDiversityPenalty: 5.0,
  explorerMaxTransfers: 2,
  explorerDurationCap: 1.5,
  accessCandidatesPerDirection: 16,
  maxAccessQueries: 30,
  egressCandidatesPerDirection: 16,
  maxEgressQueries: 30,
};

export async function route(start: LatLng, end: LatLng): Promise<Result<MultiNavigateResponse>> {
  try {
    const algorithmUrl = process.env.ALGORITHM_URL;
    if (!utils.isExisty(algorithmUrl)) {
      return new Failure(ErrorCodes.Fatal, "Configuration error.", { algorithmUrl: "Not set" });
    }

    const url = new URL("/navigate", algorithmUrl!);
    const request = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ start, end }),
    });

    if (!request.ok) {
      const content = await request.text();
      return new Failure(ErrorCodes.Fatal, "Failed to route", {
        start,
        end,
        status: request.status,
        statusText: request.statusText,
        content,
      });
    }

    const result = await request.json() as MultiNavigateResponse;
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to route", { start, end }, e);
  }
}

export async function simulate(
  start: LatLng,
  end: LatLng,
  overrides: SimulationOverrides,
): Promise<Result<MultiNavigateResponse>> {
  try {
    const algorithmUrl = process.env.ALGORITHM_URL;
    if (!utils.isExisty(algorithmUrl)) {
      return new Failure(ErrorCodes.Fatal, "Configuration error.", { algorithmUrl: "Not set" });
    }

    const url = new URL("/navigate/simulate", algorithmUrl!);
    const request = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ start, end, overrides }),
    });

    if (!request.ok) {
      const content = await request.text();
      return new Failure(ErrorCodes.Fatal, "Failed to simulate route", {
        start,
        end,
        overrides,
        status: request.status,
        statusText: request.statusText,
        content,
      });
    }

    const result = await request.json() as MultiNavigateResponse;
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to simulate route", { start, end, overrides }, e);
  }
}

export async function invalidate(): Promise<Result<undefined>> {
  try {
    const algorithmUrl = process.env.ALGORITHM_URL;
    if (!utils.isExisty(algorithmUrl)) {
      return new Failure(ErrorCodes.Fatal, "Configuration error.", { algorithmUrl: "Not set" });
    }

    const url = new URL("/cache/invalidate", algorithmUrl!);
    const request = await fetch(url.toString(), {
      method: "POST",
    });

    if (!request.ok) {
      const content = await request.text();
      return new Failure(ErrorCodes.Fatal, "Failed to invalidate", {
        status: request.status,
        statusText: request.statusText,
        content,
      });
    }

    return new Success(undefined);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to invalidate", {}, e);
  }
}

type LatLng = { lat: number, lng: number };
