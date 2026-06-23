import type { NextRequest } from "next/server";
import { z } from "zod";

import { session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { logActivity } from "@/lib/management/activity-logger";
import * as routingFast from "@/lib/routing-fast";
import { oneOf } from "@/lib/one-of";

const AlgorithmWeightsSchema = z.object({
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
  maxStartingRoutes: z.number().int(),
  maxSuggestionsPerStartRoute: z.number().int(),
  maxTransfersToShow: z.number().int(),
  transferDiversityPenalty: z.number(),
  accessCandidatesPerDirection: z.number().int(),
  maxAccessQueries: z.number().int(),
  egressCandidatesPerDirection: z.number().int(),
  maxEgressQueries: z.number().int(),
});

export async function GET() {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const result = await routingFast.getWeights();

  return oneOf(result).match(
    weights => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(weights).build(),
    error => ApiResponseBuilder.createFromFailure(error).build(),
  );
}

export async function PUT(request: NextRequest) {
  const currentSession = await session.verify("administrator_user");
  if (currentSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(currentSession)
      .build();
  }

  const body = await tryParseJson<unknown>(request);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [{ message: "Invalid JSON payload." }])
      .build();
  }

  const validation = AlgorithmWeightsSchema.safeParse(body);
  if (!validation.success) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.error.issues.map(issue => ({
        message: `${issue.path.join(".")}: ${issue.message}`,
      })),
    ).build();
  }

  const result = await routingFast.updateWeights(validation.data);

  return oneOf(result).match(
    () => {
      void logActivity({
        actorUserId: currentSession.user!.id,
        actorRole: currentSession.user!.role,
        category: "write_operation",
        action: "algorithm_weights_updated",
        summary: "Updated algorithm routing weights",
        routePath: "/api/restricted/management/algorithm-weights",
        httpMethod: "PUT",
        statusCode: StatusCodes.Status200Ok,
      });

      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody({ message: "Weights updated" })
        .build();
    },
    error => ApiResponseBuilder.createFromFailure(error).build(),
  );
}
