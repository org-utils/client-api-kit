---
"client-api-kit": minor
---

Added TanStack Query prefetch support via a new `client-api-kit/server` entry point (`createResourcePrefetcher`). Prefetch functions (`prefetchList`, `prefetchInfiniteList`, `prefetchGetById`, `prefetchCustom`) share the hooks' query keys, so they work server-side with `dehydrate`/`HydrationBoundary` (SSR hydration) and client-side before navigation. `createQueryClient` is now also exported from `client-api-kit/server`.

Also reordered `createResource`'s generic type parameters to `<T, ListParams, CreateInput, UpdateInput>` and added a `custom` query-key builder to `createQueryKeys`.