"use server";

import { Failure, FailureCodes, Success } from "@/lib/oneOf/response-types";

const { NOMINATIM_URL } = process.env;

/**
 * Searches using Nominatim with a bounding box restriction. This is to prevent
 * searches that go outside the scope of this application.
 *
 * @param {string} query - The query string to search for.
 * @returns {Promise<Success | Failure>} Retusn the result of search operation.
 */
export async function searchRestricted(query: string) {
  const url = new URL(NOMINATIM_URL ?? "http://localhost:6901");
  url.pathname = "/search";
  url.searchParams.set("q", query);
  url.searchParams.set("viewbox", "122.019,11.628,123.336,10.407");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("format", "jsonv2");

  return await goFetch(url);
}

/**
 * Reverses the geolocation coordinates to provide address information if the coordinates fall within a specified area.
 *
 * @param {number} lat - The latitude of the location to reverse.
 * @param {number} lon - The longitude of the location to reverse.
 * @return {Promise<object>} A promise that resolves to the reverse geocoding data in JSON format.
 */
export async function reverseRestricted(lat: number, lon: number) {
  // Check if it's within the viewbox:
  if (lon >= 122.019 && lon <= 123.336 && lat <= 11.628 && lat >= 10.407) {
    return await reverse(lat, lon);
  }

  return new Failure(FailureCodes.ValidationFailure, "Coordinates is outside the area supported.");
}

/**
 * Searches using Nominatim for the given query string.
 *
 * @param {string} query - The query string to search for.
 * @return {Promise<Success | Failure>} Returns the result of search operation.
 */
export async function search(query: string): Promise<Success<object> | Failure<string>> {
  const url = new URL(NOMINATIM_URL ?? "http://localhost:6901");
  url.pathname = "/search";
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");

  return await goFetch(url);
}

/**
 * Fetches reverse geocoding information for the given latitude and longitude.
 *
 * @param {number} lat - The latitude of the location to reverse geocode.
 * @param {number} lon - The longitude of the location to reverse geocode.
 * @return {Promise<object>} A promise that resolves to the reverse geocoding data in JSON format.
 */
export async function reverse(lat: number, lon: number): Promise<Success<object> | Failure<string>> {
  const url = new URL(NOMINATIM_URL ?? "http://localhost:6901");
  url.pathname = "/reverse";
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");

  return await goFetch(url);
}

/**
 * Makes an HTTP GET request to the given URL and processes the response.
 *
 * @param {URL} url - The URL to send the GET request to.
 * @return {Promise<Success|Failure>} A promise that resolves to a `Success` object containing the response data,
 * or a `Failure` object in case of an error.
 */
async function goFetch(url: URL) {
  try {
    const request = await fetch(url.toString(), {
      method: "GET",
    });
    const response: object = await request.json();

    return new Success(response);
  } catch {
    return new Failure(FailureCodes.Fatal, "Internal error.");
  }
}
