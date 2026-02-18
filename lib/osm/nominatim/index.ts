"use server";

import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";

const { NOMINATIM_URL } = process.env;

/**
 * Performs a Nominatim `/search` request and returns results as JSON (`jsonv2`).
 *
 * All key/value pairs in `query` are forwarded as URL query parameters. The response format
 * is forced to `jsonv2` regardless of the provided query parameters.
 *
 * If `options.localOnly` is enabled, the request is constrained to a predefined bounding box
 * (via `viewbox` + `bounded=1`) so results are limited to the area where the app operates.
 *
 * @param query - URL query parameters to send to Nominatim (e.g. `{ q: "Cebu", limit: "5" }`).
 * @param options - Optional search behavior flags.
 * @param options.localOnly - When `true`, restricts results to the app's operating area.
 * @returns A wrapped result containing either a successful Nominatim search response or an error.
 */
export async function search(query: Record<string, string>, options?: { localOnly: boolean }) {
  const url = new URL("/search", NOMINATIM_URL ?? "http://localhost:6701");

  // Compose query parameters
  for (const key of Object.keys(query)) {
    url.searchParams.set(key, query[key]);
  }

  // Force output to always be JSON.
  url.searchParams.set("format", "jsonv2");

  // If options.localOnly is true, restrict it only to the areas where we are operating.
  if (options?.localOnly) {
    url.searchParams.set("countrycodes", "ph");
    url.searchParams.set("viewbox", "122.019,11.628,123.336,10.407");
    url.searchParams.set("bounded", "1");
  }

  return await goFetch<NominatimSearchResponse>(url);
}

/**
 * Performs a Nominatim `/reverse` request and returns a JSON (`jsonv2`) reverse-geocode result.
 *
 * All key/value pairs in `query` are forwarded as URL query parameters. The `lat`/`lon` values are
 * parsed and validated (must be finite numbers) and then re-applied to the URL to ensure consistent
 * numeric formatting. The response format is forced to `jsonv2` regardless of the provided query.
 *
 * If `options.localOnly` is enabled, the coordinates are validated against the app's operating area;
 * coordinates outside that area return a validation failure without making a network request.
 *
 * @param query - URL query parameters to send to Nominatim. Must include `lat` and `lon`.
 * @param options - Optional reverse-geocoding behavior flags.
 * @param options.localOnly - When `true`, rejects coordinates outside the operating area.
 * @returns A wrapped result containing either a successful Nominatim reverse response or an error.
 */
export async function reverse(query: Record<string, string | number>, options?: { localOnly: boolean }) {
  const url = new URL("/reverse", NOMINATIM_URL ?? "http://localhost:6701");

  const lat = Number(query.lat);
  const lon = Number(query.lon);

  // Validate the important queries
  if (!lat || !lon || Number.isNaN(lat) || Number.isNaN(lon) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Failure(FailureCodes.ValidationFailure, {
      error: { code: 400, message: "Invalid lat/lon values." },
    } satisfies NominatimErrorResponse);
  }

  if (options?.localOnly) {
    if (lon < 122.019 || lon > 123.336 || lat > 11.628 || lat < 10.407) {
      return new Failure(FailureCodes.ValidationFailure, {
        error: { code: 400, message: "The coordinates are outside the operating area." },
      } satisfies NominatimErrorResponse);
    }
  }

  for (const key of Object.keys(query)) {
    url.searchParams.set(key, query[key].toString());
  }

  // Force parsed parameters as values
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lon.toString());

  // Force output to always be JSON.
  url.searchParams.set("format", "jsonv2");

  return await goFetch<NominatimReverseResponse>(url);
}

async function goFetch<T extends NominatimSearchResponse | NominatimReverseResponse>(url: URL) {
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return new Failure(FailureCodes.ProxyFatal, data as NominatimErrorResponse);
    }

    return new Success(data as T);
  } catch {
    return new Failure(FailureCodes.ProxyFatal, { error: { code: 500, message: "Internal server error." } });
  }
}

export type NominatimErrorResponse = {
  error: {
    code: number;
    message: string;
  };
}

export type NominatimBaseResponse = {
  place_id: number;
  license: string;
  osm_type: string;
  osm_id: string;
  lat: string;
  lon: string;
  category: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  boundingbox: Array<string>;
}

export type NominatimReverseResponse = NominatimBaseResponse & {
  address: {
    historic?: string;
    road: string;
    quarter: string;
    neighbourhood?: string;
    suburb: string;
    village: string;
    city: string;
    region: string;
    "ISO3166-2-lvl3": string;
    postcode: string;
    country: string;
    country_code: string;
  };
}

export type NominatimSearchResponse = Array<NominatimBaseResponse>;
