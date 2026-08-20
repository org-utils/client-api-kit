---
"client-api-kit": minor
---

`createResource` now defaults to the TanStack Query-shaped results mode (`mode: "query"` - see below) instead of throwing; pass `mode: "throw"` explicitly for the old rejecting behavior. The `onError` option is kept as a deprecated alias for `mode`.

- `mode: "query"` (new default) - every method resolves a settled `QueryResult<T>` with the same field names the hooks return (`data`, `error`, `status`, `isError`, `isSuccess`, `isLoading`, `isPending`, `isFetching`). It is type-safe where `UseQueryResult` is loose: `status` is a strict discriminant and the boolean flags are literal types, so `data` narrows to `T` exactly when `isSuccess` and `error` to `ApiClientError` exactly when `isError`. `isLoading`/`isPending`/`isFetching` are always `false` after `await` (the call is settled), kept for shape parity so a component can swap a hook call for a plain resource call.
- `mode: "result"` - every method resolves a typed `ResourceResult<T>` union (`{ success: true; data }` or `{ success: false; error: ApiClientError }`) instead of throwing.
- New `setMode(mode)` method (like `setHeaders`/`setConfig`) switches the resource's mode at runtime and returns the same resource typed for the new mode; the switch is global to the resource.
- `createResourceHooks` and `createResourcePrefetcher` are now mode-agnostic: they accept a resource in any mode and extract the payload (or throw the `ApiClientError`) from its result shape via the new exported `unwrapResourceResult` helper.

Also added optional `parse` validators to `createResource` options - one per method (`list`, `getById`, `create`, `update`), applied to `response.data` at runtime before it's returned (works with zod schemas). A failing validator is normalized into an `ApiClientError` with `kind: "unknown"` and the original error as its cause. `custom()` accepts a per-call `parse` for its payload.