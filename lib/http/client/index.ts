"use client";

import { createFetch } from "@better-fetch/fetch";

export const $fetch = createFetch({
  retry: {
    type: "exponential",
    attempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,

    shouldRetry: (resp) => {
      if (resp === null) return true;

      switch (resp.status) {
      case 408:
      case 429:
      case 502:
      case 503:
      case 504:
        return true;
      default:
        return false;
      }
    },
  },
});

export interface BetterFetchResponse<TSuccess, TError> {
    data: TSuccess,
    error?: TError
}
