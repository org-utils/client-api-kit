import {
  type FetchInfiniteQueryOptions,
  type FetchQueryOptions,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { ListResult } from "client-api-types/client";
import type { RequestOptions } from "client-api-types";
import type { ApiClientError } from "../errors/ApiClientError.js";
import {
  unwrapResourceResult,
  type AnyResourceClient,
} from "../resource/create-resource.js";
import { createQueryKeys, type QueryKeyFactory } from "../resource/query-keys.js";
import { isCursorPagination } from "../utils/index.js";

/**
 * Prefetch functions for one resource, built by `createResourcePrefetcher`.
 * Each function takes the {@link QueryClient} to fill as its first argument,
 * so the same code works on the server (a fresh per-request QueryClient that
 * you `dehydrate` into a `HydrationBoundary`) and on the client (e.g.
 * `useQueryClient()` before a navigation). Query keys and query functions are
 * identical to the ones the hooks use, so prefetched data hydrates into
 * `useList`/`useInfiniteList`/`useGetById` without a second network request.
 *
 * @typeParam T - The record type this resource manages.
 * @typeParam ListParams - List params shape (offset or cursor pagination).
 */
export interface ResourcePrefetcher<T, ListParams extends object> {
  /** Query-key builders, identical to the ones on the hooks object. */
  queryKeys: QueryKeyFactory<ListParams>;

  /**
   * Prefetches an offset-paginated (or any non-infinite) list query into
   * `queryClient`, keyed exactly like `useList`, so the hook renders from
   * cache when it mounts. Uses a `staleTime` of 60s by default so hydrated
   * data isn't instantly refetched; override via `options`.
   *
   * @param queryClient - The client to populate (server or client).
   * @param params - The same list params you'd pass to `useList`.
   * @param options - TanStack Query options merged over the built-in defaults.
   * @returns A promise resolving once the fetch settles. Failed prefetches do not
   *   reject (matching TanStack Query); the error is stored in the query cache
   *   and readable via `queryClient.getQueryState(key).error`.
   */
  prefetchList: (
    queryClient: QueryClient,
    params?: ListParams,
    options?: Omit<FetchQueryOptions<ListResult<T>, ApiClientError>, "queryKey" | "queryFn">,
  ) => Promise<void>;

  /**
   * Prefetches the first page of a cursor-paginated infinite list into
   * `queryClient`, keyed exactly like `useInfiniteList`. Prefetches one page
   * by default; pass `options.pages` (and any `getNextPageParam` override) to
   * warm more pages ahead of time.
   *
   * @param queryClient - The client to populate (server or client).
   * @param params - The same params (minus the cursor) you'd pass to `useInfiniteList`.
   * @param options - TanStack Query options merged over the built-in defaults.
   * @returns A promise resolving once the fetch settles. Failed prefetches do not
   *   reject (matching TanStack Query); the error is stored in the query cache
   *   and readable via `queryClient.getQueryState(key).error`.
   */
  prefetchInfiniteList: (
    queryClient: QueryClient,
    params?: Omit<ListParams, "cursor">,
    options?: Omit<
      FetchInfiniteQueryOptions<
        ListResult<T>,
        ApiClientError,
        InfiniteData<ListResult<T>, string | undefined>,
        QueryKey,
        string | undefined
      >,
      "queryKey" | "queryFn"
    >,
  ) => Promise<void>;

  /**
   * Prefetches a single record into `queryClient`, keyed exactly like
   * `useGetById`, so the hook renders from cache when it mounts.
   *
   * @param queryClient - The client to populate (server or client).
   * @param id - The record's id.
   * @param options - TanStack Query options merged over the built-in defaults.
   * @returns A promise resolving once the fetch settles. Failed prefetches do not
   *   reject (matching TanStack Query); the error is stored in the query cache
   *   and readable via `queryClient.getQueryState(key).error`.
   */
  prefetchGetById: (
    queryClient: QueryClient,
    id: string | number,
    options?: Omit<FetchQueryOptions<T, ApiClientError>, "queryKey" | "queryFn">,
  ) => Promise<void>;

  /**
   * Prefetches a custom endpoint (the `custom` escape hatch) into
   * `queryClient`. Keyed by `[resourceName, "custom", method, path, params]` -
   * pass distinct `path`/`params` for distinct cache entries.
   *
   * @typeParam R - The response payload type. Defaults to `unknown`.
   * @param queryClient - The client to populate (server or client).
   * @param method - HTTP method. Defaults to `"GET"`.
   * @param path - Path appended to the base path. Defaults to the base path itself.
   * @param callOptions - Request body, query params, and per-call headers/signal.
   * @param options - TanStack Query options merged over the built-in defaults.
   * @returns A promise resolving once the fetch settles. Failed prefetches do not
   *   reject (matching TanStack Query); the error is stored in the query cache
   *   and readable via `queryClient.getQueryState(key).error`.
   */
  prefetchCustom: <R = unknown>(
    queryClient: QueryClient,
    method?: "GET" | "POST" | "PUT" | "DELETE",
    path?: string,
    callOptions?: {
      data?: any;
      params?: Record<string, any>;
      options?: RequestOptions;
    },
    options?: Omit<FetchQueryOptions<R, ApiClientError>, "queryKey" | "queryFn">,
  ) => Promise<void>;
}

/**
 * Wraps a `createResource(...)` result with prefetch functions that share the
 * exact query keys and query functions of `createResourceHooks(...)`. This is
 * the server-side counterpart to the hooks layer: call it in a server
 * component or server action against a per-request `QueryClient`, then
 * `dehydrate` that client into a `HydrationBoundary` so the client's
 * `useList`/`useInfiniteList`/`useGetById` render from cache instead of
 * fetching. The same functions also work on the client (e.g. prefetching
 * before a route change).
 *
 * @typeParam T - The record type this resource manages.
 * @typeParam ListParams - List params shape.
 * @typeParam CreateInput - Payload type for `create`.
 * @typeParam UpdateInput - Payload type for `update`.
 * @param resource - The resource created with `createResource(...)`. Works in
 *   any mode (`"query"` default, `"result"`, or `"throw"`): the payload is
 *   extracted from the mode's result shape internally. Use the same instance
 *   and `resourceName` as the one passed to `createResourceHooks` so the
 *   query keys line up.
 * @param resourceName - Stable, unique name, e.g. `"users"`. Must match the
 *   one used by `createResourceHooks`.
 * @returns The {@link ResourcePrefetcher} object with `prefetchList`,
 *   `prefetchInfiniteList`, `prefetchGetById`, `prefetchCustom`, and
 *   `queryKeys`.
 *
 * @example
 * const usersResource = createResource<User, OffsetPaginationParams, CreateUserInput, UpdateUserInput>(client, { baseURL: "/users" });
 * export const userPrefetcher = createResourcePrefetcher(usersResource, "users");
 *
 * // app/users/page.tsx (Server Component)
 * const queryClient = createQueryClient();
 * await userPrefetcher.prefetchList(queryClient, { page: 1, limit: 20 });
 * return <HydrationBoundary state={dehydrate(queryClient)}><UserList /></HydrationBoundary>;
 */
export function createResourcePrefetcher<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
>(
  resource: AnyResourceClient<T, ListParams, CreateInput, UpdateInput>,
  resourceName: string,
): ResourcePrefetcher<T, ListParams> {
  const queryKeys = createQueryKeys<ListParams>(resourceName);

  const PREFETCH_STALE_TIME = 60_000;

  /** {@link ResourcePrefetcher.prefetchList} */
  async function prefetchList(
    queryClient: QueryClient,
    params?: ListParams,
    options?: Omit<FetchQueryOptions<ListResult<T>, ApiClientError>, "queryKey" | "queryFn">,
  ): Promise<void> {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.list(params),
      queryFn: async ({ signal }) => unwrapResourceResult(await resource.list(params, { signal })),
      staleTime: PREFETCH_STALE_TIME,
      ...options,
    });
  }

  /** {@link ResourcePrefetcher.prefetchInfiniteList} */
  async function prefetchInfiniteList(
    queryClient: QueryClient,
    params?: Omit<ListParams, "cursor">,
    options?: Omit<
      FetchInfiniteQueryOptions<
        ListResult<T>,
        ApiClientError,
        InfiniteData<ListResult<T>, string | undefined>,
        QueryKey,
        string | undefined
      >,
      "queryKey" | "queryFn"
    >,
  ): Promise<void> {
    await queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.infinite(params),
      queryFn: async ({ pageParam, signal }) =>
        unwrapResourceResult(await resource.list({ ...(params as ListParams), cursor: pageParam }, { signal })),
      initialPageParam: undefined,
      pages: 1,
      getNextPageParam: (lastPage) =>
        isCursorPagination(lastPage.pagination) ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
      staleTime: PREFETCH_STALE_TIME,
      ...options,
    });
  }

  /** {@link ResourcePrefetcher.prefetchGetById} */
  async function prefetchGetById(
    queryClient: QueryClient,
    id: string | number,
    options?: Omit<FetchQueryOptions<T, ApiClientError>, "queryKey" | "queryFn">,
  ): Promise<void> {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.detail(id),
      queryFn: async ({ signal }) => unwrapResourceResult(await resource.getById(id, { signal })),
      staleTime: PREFETCH_STALE_TIME,
      ...options,
    });
  }

  /** {@link ResourcePrefetcher.prefetchCustom} */
  async function prefetchCustom<R = unknown>(
    queryClient: QueryClient,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    path?: string,
    callOptions?: {
      data?: any;
      params?: Record<string, any>;
      options?: RequestOptions;
    },
    options?: Omit<FetchQueryOptions<R, ApiClientError>, "queryKey" | "queryFn">,
  ): Promise<void> {
    const { data, params, options: requestOptions } = callOptions ?? {};

    await queryClient.prefetchQuery({
      queryKey: queryKeys.custom(method, path, params),
      queryFn: async ({ signal }) =>
        unwrapResourceResult(
          await resource.custom<R>(method, path, {
            ...(data !== undefined ? { data } : {}),
            ...(params !== undefined ? { params } : {}),
            ...(requestOptions || signal
              ? { options: { ...requestOptions, ...(signal ? { signal } : {}) } }
              : {}),
          }),
        ),
      staleTime: PREFETCH_STALE_TIME,
      ...options,
    });
  }

  return { queryKeys, prefetchList, prefetchInfiniteList, prefetchGetById, prefetchCustom };
}