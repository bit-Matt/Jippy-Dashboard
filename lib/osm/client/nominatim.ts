import { $fetch } from "@/lib/http/client";
import { IApiResponse, IApiResponseError } from "@/lib/http/ResponseComposer";
import type { NominatimReverseResponse, NominatimSearchResponse } from "@/lib/osm/nominatim";

export const nominatim = {
  async reverse(payload: Record<string, string | number>, options?: NominatimOptions) {
    const path = `/api/${options?.restricted ? "public" : "restricted"}/osm/nominatim/reverse`;
    return await doRequest<NominatimReverseResponse>(path, payload);
  },

  async search(payload: Record<string, string>, options?: NominatimOptions) {
    const path = `/api/${options?.restricted ? "public" : "restricted"}/osm/nominatim/search`;
    return await doRequest<NominatimSearchResponse>(path, payload);
  },
};

async function doRequest<T extends NominatimSearchResponse | NominatimReverseResponse>(path: string, query: Record<string, string | number>) {
  const { data, error } = await $fetch<IApiResponse<T>, IApiResponseError>(path, {
    method: "GET",
    query,
  });

  return { data, error };
}

type NominatimOptions = {
  /**
   * Use restricted API routes.
   */
  restricted: boolean;
}
