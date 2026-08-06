export interface QueryKeyFactory<ListParams> {
  all: readonly [string];
  lists: () => readonly [string, "list"];
  list: (params?: ListParams) => readonly [string, "list", ListParams | undefined];
  infiniteLists: () => readonly [string, "infinite"];
  infinite: (params?: Omit<ListParams, "cursor">) => readonly [string, "infinite", Omit<ListParams, "cursor"> | undefined];
  details: () => readonly [string, "detail"];
  detail: (id: string | number) => readonly [string, "detail", string | number];
}

/**
 * Standard hierarchical query keys (matches the pattern TanStack Query's own
 * docs recommend): `["users"]` -> `["users", "list"]` -> `["users", "list", params]`.
 * Invalidating a higher level (e.g. `queryKeys.lists()`) invalidates every
 * key nested under it.
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
  };
}
