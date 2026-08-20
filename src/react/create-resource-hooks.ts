import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { ResourceClient, ListResult } from "client-api-types/client";
import type { ApiClientError } from "../errors/ApiClientError.js";
import { createQueryKeys, type QueryKeyFactory } from "../resource/query-keys.js";
import { isCursorPagination } from "../utils/index.js";

/**
 * The full set of TanStack Query hooks for one resource, built by
 * `createResourceHooks`. All hooks accept the underlying TanStack Query
 * options object and merge it with the built-in behavior (cache
 * invalidation for mutations, `keepPreviousData` for lists).
 *
 * @typeParam T - The record type this resource manages.
 * @typeParam CreateInput - Payload type for the create mutation.
 * @typeParam UpdateInput - Payload type for the update mutation.
 * @typeParam ListParams - List params shape (offset or cursor pagination).
 */
export interface ResourceHooks<
  T,
  CreateInput,
  UpdateInput,
  ListParams extends object,
> {
  /** Query-key builders for manual cache operations (`detail(id)`, `lists()`, ...). */
  queryKeys: QueryKeyFactory<ListParams>;

  /**
   * Offset-paginated (or any non-infinite) list query. Uses `keepPreviousData`
   * by default so page navigation doesn't flash a loading state.
   *
   * @param params - List query params; changes to these produce new cache entries.
   * @param options - TanStack Query options merged over the built-in defaults.
   */
  useList: (
    params?: ListParams,
    options?: Omit<UseQueryOptions<ListResult<T>, ApiClientError>, "queryKey" | "queryFn">,
  ) => ReturnType<typeof useQuery<ListResult<T>, ApiClientError>>;

  /**
   * Cursor-paginated infinite list (e.g. a feed with "load more"). `ListParams`
   * must be cursor-shaped (`{ cursor?: string; limit: number }` at minimum).
   * Pagination is driven by `nextCursor`/`prevCursor` from the server.
   *
   * @param params - List params without the cursor (the hook manages it).
   * @param options - TanStack Query options merged over the built-in defaults.
   */
  useInfiniteList: (
    params?: Omit<ListParams, "cursor">,
    options?: Omit<
      UseInfiniteQueryOptions<ListResult<T>, ApiClientError, InfiniteData<ListResult<T>>, QueryKey, string | undefined>,
      "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"
    >,
  ) => ReturnType<
    typeof useInfiniteQuery<ListResult<T>, ApiClientError, InfiniteData<ListResult<T>>, QueryKey, string | undefined>
  >;

  /**
   * Fetch a single record by id. Automatically disabled while `id` is
   * null/undefined, so it's safe to call unconditionally.
   *
   * @param id - The record's id, or null/undefined to keep the query disabled.
   * @param options - TanStack Query options merged over the built-in defaults.
   */
  useGetById: (
    id: string | number | undefined | null,
    options?: Omit<UseQueryOptions<T, ApiClientError>, "queryKey" | "queryFn">,
  ) => ReturnType<typeof useQuery<T, ApiClientError>>;

  /**
   * Create mutation. On success invalidates all list/infinite queries for
   * this resource so fresh data is refetched.
   *
   * @param options - TanStack Query mutation options (your `onSuccess` still fires).
   */
  useCreate: (
    options?: UseMutationOptions<T, ApiClientError, CreateInput>,
  ) => ReturnType<typeof useMutation<T, ApiClientError, CreateInput>>;

  /**
   * Update mutation. On success invalidates list/infinite queries and
   * patches the cached detail entry for the updated record.
   *
   * @param options - TanStack Query mutation options (your `onSuccess` still fires).
   */
  useUpdate: (
    options?: UseMutationOptions<T, ApiClientError, { id: string | number; input: UpdateInput }>,
  ) => ReturnType<typeof useMutation<T, ApiClientError, { id: string | number; input: UpdateInput }>>;

  /**
   * Delete mutation. On success invalidates list/infinite queries and evicts
   * the cached detail entry for the deleted record.
   *
   * @param options - TanStack Query mutation options (your `onSuccess` still fires).
   */
  useDelete: (
    options?: UseMutationOptions<void, ApiClientError, string | number>,
  ) => ReturnType<typeof useMutation<void, ApiClientError, string | number>>;
}

/**
 * Wraps a `createResource(...)` result with a full set of TanStack Query
 * hooks - the client-component counterpart to the plain async resource
 * (which you'd use in server components/server actions instead). Cache
 * invalidation between hooks is wired up automatically using a shared query
 * key hierarchy: creating/updating/deleting a record invalidates the list
 * views for the same resource.
 *
 * @typeParam T - The record type this resource manages.
 * @typeParam CreateInput - Payload type for `create`. Defaults to `Partial<T>`.
 * @typeParam UpdateInput - Payload type for `update`. Defaults to `Partial<T>`.
 * @typeParam ListParams - List params shape. Defaults to `Record<string, unknown>`.
 * @param resource - The resource created with `createResource(...)`.
 * @param resourceName - Stable, unique name used for the query keys, e.g. `"users"`.
 * @returns The {@link ResourceHooks} object with `useList`, `useInfiniteList`,
 *   `useGetById`, `useCreate`, `useUpdate`, `useDelete`, and `queryKeys`.
 *
 * @example
 * const usersResource = createResource<User, CreateUserInput, UpdateUserInput>(client, { basePath: "/users" });
 * export const userHooks = createResourceHooks(usersResource, "users");
 *
 * function UserList() {
 *   const { data, isPending, error } = userHooks.useList({ page: 1, limit: 20 });
 *   ...
 * }
 */
export function createResourceHooks<
  T,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
  ListParams extends object = Record<string, unknown>,
>(
  resource: ResourceClient<T, CreateInput, UpdateInput, ListParams>,
  resourceName: string,
): ResourceHooks<T, CreateInput, UpdateInput, ListParams> {
  const queryKeys = createQueryKeys<ListParams>(resourceName);

  /** {@link ResourceHooks.useList} */
  function useList(
    params?: ListParams,
    options?: Omit<UseQueryOptions<ListResult<T>, ApiClientError>, "queryKey" | "queryFn">,
  ) {
    return useQuery({
      placeholderData: keepPreviousData,
      ...options,
      queryKey: queryKeys.list(params),
      queryFn: ({ signal }) => resource.list(params, { signal }),
    });
  }

  /** {@link ResourceHooks.useInfiniteList} */
  function useInfiniteList(
    params?: Omit<ListParams, "cursor">,
    options?: Omit<
      UseInfiniteQueryOptions<ListResult<T>, ApiClientError, InfiniteData<ListResult<T>>, QueryKey, string | undefined>,
      "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam"
    >,
  ) {
    return useInfiniteQuery({
      ...options,
      queryKey: queryKeys.infinite(params),
      queryFn: ({ pageParam, signal }) =>
        resource.list({ ...(params as ListParams), cursor: pageParam }, { signal }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) =>
        isCursorPagination(lastPage.pagination) ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
      getPreviousPageParam: (firstPage) =>
        isCursorPagination(firstPage.pagination) ? (firstPage.pagination.prevCursor ?? undefined) : undefined,
    });
  }

  /** {@link ResourceHooks.useGetById} */
  function useGetById(
    id: string | number | undefined | null,
    options?: Omit<UseQueryOptions<T, ApiClientError>, "queryKey" | "queryFn">,
  ) {
    return useQuery({
      ...options,
      queryKey: queryKeys.detail(id ?? ""),
      queryFn: ({ signal }) => resource.getById(id as string | number, { signal }),
      enabled: (options?.enabled ?? true) && id !== undefined && id !== null,
    });
  }

  /** {@link ResourceHooks.useCreate} */
  function useCreate(options?: UseMutationOptions<T, ApiClientError, CreateInput>) {
    const queryClient = useQueryClient();
    return useMutation({
      ...options,
      mutationFn: (input: CreateInput) => resource.create(input),
      onSuccess: (data, variables, onMutateResult, context) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.infiniteLists() });
        options?.onSuccess?.(data, variables, onMutateResult, context);
      },
    });
  }

  /** {@link ResourceHooks.useUpdate} */
  function useUpdate(options?: UseMutationOptions<T, ApiClientError, { id: string | number; input: UpdateInput }>) {
    const queryClient = useQueryClient();
    return useMutation({
      ...options,
      mutationFn: ({ id, input }: { id: string | number; input: UpdateInput }) => resource.update(id, input),
      onSuccess: (data, variables, onMutateResult, context) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.infiniteLists() });
        queryClient.setQueryData(queryKeys.detail(variables.id), data);
        options?.onSuccess?.(data, variables, onMutateResult, context);
      },
    });
  }

  /** {@link ResourceHooks.useDelete} */
  function useDelete(options?: UseMutationOptions<void, ApiClientError, string | number>) {
    const queryClient = useQueryClient();
    return useMutation({
      ...options,
      mutationFn: (id: string | number) => resource.remove(id),
      onSuccess: (data, id, onMutateResult, context) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.infiniteLists() });
        queryClient.removeQueries({ queryKey: queryKeys.detail(id) });
        options?.onSuccess?.(data, id, onMutateResult, context);
      },
    });
  }

  return { queryKeys, useList, useInfiniteList, useGetById, useCreate, useUpdate, useDelete };
}