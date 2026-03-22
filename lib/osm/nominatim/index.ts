import { $fetch } from "@/lib/http/client";

export async function reverse(payload: Record<string, string | number>) {
  const reverseUrl = new URL("/reverse", process.env.NEXT_PUBLIC_NOMINATIM_URL);
  for (const [key, value] of Object.entries(payload)) {
    reverseUrl.searchParams.set(key, String(value));
  }

  // Force
  reverseUrl.searchParams.set("format", "jsonv2");

  const { data, error } = await $fetch<NominatimReverseResponse>(reverseUrl.toString(), {
    method: "GET",
  });

  return {
    data: data ?? null,
    error,
  };
}

export async function search(payload: Record<string, string>) {
  const reverseUrl = new URL("/search", process.env.NEXT_PUBLIC_NOMINATIM_URL);
  for (const [key, value] of Object.entries(payload)) {
    reverseUrl.searchParams.set(key, String(value));
  }

  // Force
  reverseUrl.searchParams.set("format", "jsonv2");
  reverseUrl.searchParams.set("countrycodes", "ph");
  reverseUrl.searchParams.set("viewbox", "122.019,11.628,123.336,10.407");
  reverseUrl.searchParams.set("bounded", "1");

  const { data, error } = await $fetch<NominatimSearchResponse>(reverseUrl.toString(), {
    method: "GET",
  });

  return {
    data: data ?? null,
    error,
  };
};

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
