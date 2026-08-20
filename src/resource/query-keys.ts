/**
 * Factory producing the hierarchical query keys for one resource. Following
 * the pattern TanStack Query's own docs recommend, keys nest from the
 * resource name down to specific queries, so invalidating a higher level
 * invalidates everything under it.
 *
 * @typeParam ListParams - The resource's list params shape, used to key
 *   list/infinite queries distinctly by their params.
 */
export interface QueryKeyFactory<ListParams> {
  /** `[resourceName]` - the root key; invalidating it clears every query for the resource. */
  all: readonly [string];
  /** `[resourceName, "list"]` - matches every offset list query, regardless of params. */
  lists: () => readonly [string, "list"];
  /** `[resourceName, "list", params]` - a single offset list query, keyed by its params. */
  list: (params?: ListParams) => readonly [string, "list", ListParams | undefined];
  /** `[resourceName, "infinite"]` - matches every infinite list query, regardless of params. */
  infiniteLists: () => readonly [string, "infinite"];
  /** `[resourceName, "infinite", params]` - a single infinite list query, keyed by its params (minus the cursor). */
  infinite: (params?: Omit<ListParams, "cursor">) => readonly [string, "infinite", Omit<ListParams, "cursor"> | undefined];
  /** `[resourceName, "detail"]` - matches every detail query, regardless of id. */
  details: () => readonly [string, "detail"];
  /** `[resourceName, "detail", id]` - a single record's detail query. */
  detail: (id: string | number) => readonly [string, "detail", string | number];
  /** `[resourceName, "custom", method, path, params]` - a single custom request, keyed by its request shape. */
  custom: (
    method?: "GET" | "POST" | "PUT" | "DELETE",
    path?: string,
    params?: Record<string, any>,
  ) => readonly [string, "custom", "GET" | "POST" | "PUT" | "DELETE" | undefined, string | undefined, Record<string, any> | undefined];
}

/**
 * Builds a {@link QueryKeyFactory} for a resource. Standard hierarchical
 * query keys (matches the pattern TanStack Query's own docs recommend):
 * `["users"]` -> `["users", "list"]` -> `["users", "list", params]`.
 * Invalidating a higher level (e.g. `queryKeys.lists()`) invalidates every
 * key nested under it.
 *
 * @typeParam ListParams - The resource's list params shape.
 * @param resourceName - Stable, unique name for the resource, e.g. `"users"`.
 *   Use a different name per resource so their caches don't collide.
 * @returns A factory of query-key builders for this resource.
 *
 * @example
 * const keys = createQueryKeys<OffsetPaginationParams>("users");
 * keys.list({ page: 1 }); // ["users", "list", { page: 1 }]
 */
export function createQueryKeys<ListParams>(resourceName: string): QueryKeyFactory<ListParams> {
  const all = [resourceName] as const;
  return {
    all,
    lists: () => [...all, "list"] as const,
    list: (params) => [...all, "list", params] as const,
    infiniteLists: () => [...all, "infinite"] as const,
    infinite: (params) => [...all, "infinite", params] as const,
    details: () => [...all, "detail"] as const,
    detail: (id) => [...all, "detail", id] as const,
    custom: (method, path, params) => [...all, "custom", method, path, params] as const,
  };
}