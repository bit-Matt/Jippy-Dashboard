import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import { MultiNavigateResponse } from "@/lib/map/types";
import { utils } from "@/lib/validator";

export type SimulationOverrides = {
  walkPenaltyMultiplier?: number;
  walkComfortMeters?: number;
  walkEscalationRate?: number;
  transferPenaltyMeters?: number;
  closurePenaltyMultiplier?: number;
  boardingCostFactor?: number;
  transferProximityMeters?: number;
  transitCostFactor?: number;
  minTransitRideMeters?: number;
  walkOnlyThresholdMeters?: number;
  maxTransitProximityMeters?: number;
  walkSpeedKmh?: number;
  tricycleSpeedKmh?: number;
  jeepneySpeedKmh?: number;
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
  longWalkThresholdMeters?: number;
  stationUnavailabilityThreshold?: number;
  stopProximityMeters?: number;
  maxStartingRoutes?: number;
  maxSuggestionsPerStartRoute?: number;
  maxTransfersToShow?: number;
  transferDiversityPenalty?: number;
  accessCandidatesPerDirection?: number;
  maxAccessQueries?: number;
  egressCandidatesPerDirection?: number;
  maxEgressQueries?: number;
};

export type AlgorithmWeights = Required<SimulationOverrides>;

/** Default values mirrored from the .NET weights.json for UI placeholders. */
export const ALGORITHM_WEIGHT_DEFAULTS: AlgorithmWeights = {
  walkPenaltyMultiplier: 2.0,
  walkComfortMeters: 150,
  walkEscalationRate: 0.008,
  transferPenaltyMeters: 1000,
  closurePenaltyMultiplier: 5.0,
  boardingCostFactor: 0.5,
  transferProximityMeters: 100,
  transitCostFactor: 0.5,
  minTransitRideMeters: 500,
  walkOnlyThresholdMeters: 200,
  maxTransitProximityMeters: 5_000,
  walkSpeedKmh: 4.25,
  tricycleSpeedKmh: 10,
  jeepneySpeedKmh: 10,
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
  longWalkThresholdMeters: 1_000,
  stationUnavailabilityThreshold: 0.9,
  stopProximityMeters: 30,
  maxStartingRoutes: 4,
  maxSuggestionsPerStartRoute: 3,
  maxTransfersToShow: 3,
  transferDiversityPenalty: 3.0,
  accessCandidatesPerDirection: 16,
  maxAccessQueries: 30,
  egressCandidatesPerDirection: 16,
  maxEgressQueries: 30,
};

/** @deprecated Use ALGORITHM_WEIGHT_DEFAULTS */
export const SIMULATION_OVERRIDE_DEFAULTS = ALGORITHM_WEIGHT_DEFAULTS;

export function mergeWeightsWithOverrides(
  base: AlgorithmWeights,
  overrides: SimulationOverrides,
): AlgorithmWeights {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  } as AlgorithmWeights;
}

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

export async function getWeights(): Promise<Result<AlgorithmWeights>> {
  try {
    const algorithmUrl = process.env.ALGORITHM_URL;
    if (!utils.isExisty(algorithmUrl)) {
      return new Failure(ErrorCodes.Fatal, "Configuration error.", { algorithmUrl: "Not set" });
    }

    const url = new URL("/weights", algorithmUrl!);
    const request = await fetch(url.toString(), {
      method: "GET",
    });

    if (!request.ok) {
      const content = await request.text();
      return new Failure(ErrorCodes.Fatal, "Failed to fetch algorithm weights", {
        status: request.status,
        statusText: request.statusText,
        content,
      });
    }

    const result = await request.json() as AlgorithmWeights;
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to fetch algorithm weights", {}, e);
  }
}

export async function updateWeights(weights: AlgorithmWeights): Promise<Result<{ message: string }>> {
  try {
    const algorithmUrl = process.env.ALGORITHM_URL;
    if (!utils.isExisty(algorithmUrl)) {
      return new Failure(ErrorCodes.Fatal, "Configuration error.", { algorithmUrl: "Not set" });
    }

    const url = new URL("/weights", algorithmUrl!);
    const request = await fetch(url.toString(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(weights),
    });

    if (!request.ok) {
      const content = await request.text();
      return new Failure(ErrorCodes.Fatal, "Failed to update algorithm weights", {
        status: request.status,
        statusText: request.statusText,
        content,
      });
    }

    const result = await request.json() as { message: string };
    return new Success(result);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update algorithm weights", {}, e);
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
