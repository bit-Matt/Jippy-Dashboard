import { z } from "zod";

import { ALGORITHM_WEIGHT_DEFAULTS } from "@/lib/routing-fast";

export const AlgorithmWeightsSchema = z.object({
  walkPenaltyMultiplier: z.number(),
  walkComfortMeters: z.number(),
  walkEscalationRate: z.number(),
  transitCostFactor: z.number(),
  transferPenaltyMeters: z.number(),
  minTransitRideMeters: z.number(),
  closurePenaltyMultiplier: z.number(),
  transferProximityMeters: z.number(),
  walkOnlyThresholdMeters: z.number(),
  maxTransitProximityMeters: z.number(),
  walkSpeedKmh: z.number(),
  tricycleSpeedKmh: z.number(),
  jeepneySpeedKmh: z.number(),
  tricycleRideCostFactor: z.number(),
  stationWaitPenaltyMeters: z.number(),
  hailingWaitPenaltyMeters: z.number(),
  midRouteTricyclePenaltyMeters: z.number(),
  shortTricyclePenaltyMeters: z.number(),
  maxTricycleStationWalkMeters: z.number(),
  minTricycleRideMeters: z.number(),
  backtrackPenaltyMultiplier: z.number(),
  stationUnavailabilityThreshold: z.number(),
  maxRegionBoundaryMeters: z.number(),
  tricycleDetourFactor: z.number(),
  walkDetourFactor: z.number(),
  maxDirectWalkInsteadOfHailMeters: z.number(),
  longWalkThresholdMeters: z.number(),
  maxTricycleRideToTransitMeters: z.number(),
  maxBoundaryExitWalkMeters: z.number(),
  boardingCostFactor: z.number(),
  stopProximityMeters: z.number(),
  stopSnapMeters: z.number(),
  maxStartingRoutes: z.number().int(),
  maxSuggestionsPerStartRoute: z.number().int(),
  maxTransfersToShow: z.number().int(),
  transferDiversityPenalty: z.number(),
  accessCandidatesPerDirection: z.number().int(),
  maxAccessQueries: z.number().int(),
  egressCandidatesPerDirection: z.number().int(),
  maxEgressQueries: z.number().int(),
  jeepneyBaseFare: z.number(),
  jeepneyBaseKm: z.number(),
  jeepneyFarePerKm: z.number(),
  tricycleFlatFare: z.number(),
  fareCostWeight: z.number(),
});

export type AlgorithmWeightsPayload = z.infer<typeof AlgorithmWeightsSchema>;

/** Accepts partial weight objects from export files and fills missing keys from defaults. */
export const AlgorithmWeightsImportSchema = AlgorithmWeightsSchema
  .partial()
  .transform(weights => ({
    ...ALGORITHM_WEIGHT_DEFAULTS,
    ...weights,
  }));
