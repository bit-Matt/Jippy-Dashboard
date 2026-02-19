"use server";

import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";

const { VALHALLA_URL } = process.env;

export async function status(): Promise<Failure<ValhallaRouteResponseFailure> | Success<ValhallaStatus>> {
  try {
    const url = new URL("/status", VALHALLA_URL ?? "http://localhost:6702");

    const request = await fetch(url, { method: "GET" });
    const json = await request.json() as ValhallaStatus;

    return new Success(json);
  } catch {
    return new Failure(FailureCodes.ProxyFatal, {
      error_code: 1,
      error: "Failed to Proxy",
      status_code: 500,
      status: "Internal Server Error",
    } satisfies ValhallaRouteResponseFailure);
  }
}

/**
 * Sends a routing request to the Valhalla server using the provided payload.
 *
 * This function constructs a URL with the payload as a JSON string in the search parameters,
 * performs a GET request, and processes the response. If the request succeeds, it returns
 * a Success object with the routing data. If it fails or an error occurs, it returns a
 * Failure object with appropriate error details.
 *
 * @param {ValhallaRouterPayload} payload - The routing payload containing locations (lat/lon pairs) for the route calculation.
 * @returns {Promise<Failure<ValhallaRouteResponseFailure> | Success<ValhallaRouterResponse>>}
 * A promise resolving to a Success with the Valhalla route response on success, or a Failure with error details on failure.
 */
export async function route(payload: ValhallaRouterPayload): Promise<Failure<ValhallaRouteResponseFailure> | Success<ValhallaRouterResponse>> {
  try {
    const url = new URL("/route", VALHALLA_URL ?? "http://localhost:6702");

    const params = {
      locations: payload.locations,
      costing: "auto",
      costing_options: {
        auto: {
          country_crossing_penalty: 2000.0,
        },
      },
      units: "kilometers",
    };
    url.searchParams.set("json", JSON.stringify(params));

    const request = await fetch(url, { method: "GET" });
    const json = await request.json();

    if (!request.ok) {
      return new Failure(FailureCodes.ProxyFatal, json as ValhallaRouterResponse);
    }

    return new Success(json as ValhallaRouterResponse);
  } catch {
    return new Failure(FailureCodes.ProxyFatal, {
      error_code: 1,
      error: "Failed to Proxy",
      status_code: 500,
      status: "Internal Server Error",
    } satisfies ValhallaRouteResponseFailure);
  }
}

export interface ValhallaRouterPayload {
  locations: Array<{ lat: number, lon: number }>;
}

interface ValhallaRouteResponseFailure {
  error_code: number;
  error: string;
  status_code: number;
  status: string;
}

export interface ValhallaRouterResponse {
  trip: {
    locations: Array<{
      type: string;
      lat: number;
      lon: number;
      side_of_street: string;
      original_index: number;
    }>;
    legs: Array<{
      maneuvers: Array<{
        type: number;
        instruction: string;
        verbal_succinct_transition_instruction: string;
        verbal_pre_transition_instruction: string;
        verbal_post_transition_instruction: string;
        street_names?: Array<string>;
        bearing_after: number;
        time: number;
        length: number;
        cost: number;
        begin_shape_index: number;
        end_shape_index: number;
        sign?: object;
        verbal_multi_cue: boolean;
        travel_mode: string;
        travel_type: string;
      }>;
      summary: ValhallaRouteSummary;
      shape: string;
    }>;
    summary: ValhallaRouteSummary;
    status_message: string;
    status: number;
    units: string;
    language: string;
  }
}

interface ValhallaStatus {
  version: string;
  tileset_last_modified: string;
  available_actions: Array<string>;
}

interface ValhallaRouteSummary {
  has_time_restrictions: boolean;
  has_toll: boolean;
  has_highway: boolean;
  has_ferry: boolean;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  time: number;
  length: number;
  cost: number;
}
