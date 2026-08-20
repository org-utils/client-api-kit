import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";
import { ApiClientError } from "../errors/ApiClientError.js";

/**
 * Creates a `QueryClient` with sensible defaults for a client backed by this
 * package's client:
 * - Never retries 4xx errors (they won't succeed on retry - bad input stays bad input).
 * - Does retry network errors / 5xx a couple of times, matching common API client conventions.
 * - Mutations never auto-retry, since retrying a possibly-already-applied POST/PATCH can duplicate side effects.
 *
 * @param overrides - Optional `QueryClientConfig` merged over the defaults;
 *   anything you specify wins (including nested `defaultOptions.queries`/`mutations`).
 * @returns A configured `QueryClient`.
 *
 * @example
 * const queryClient = createQueryClient({
 *   defaultOptions: { queries: { staleTime: 60_000 } },
 * });
 */
export function createQueryClient(overrides: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...overrides,
    defaultOptions: {
      ...overrides.defaultOptions,
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiClientError) {
            if (error.kind === "cancelled") return false;
            if (error.kind === "http" && error.statusCode !== undefined && error.statusCode < 500) return false;
          }
          return failureCount < 2;
        },
        ...overrides.defaultOptions?.queries,
      },
      mutations: {
        retry: false,
        ...overrides.defaultOptions?.mutations,
      },
    },
  });
}