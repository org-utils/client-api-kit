---
"client-api-kit": minor
---

Added two non-throwing modes to `createResource`, selected via the new `mode` option (default `"throw"`, unchanged; the earlier `onError` option is kept as a deprecated alias):

- `mode: "result"` - every method resolves a typed `ResourceResult<T>` union (`{ success: true; data }` or `{ success: false; error: ApiClientError }`) instead of throwing, convenient for server components and server actions.
- `mode: "query"` - every method resolves a settled, TanStack Query-shaped `QueryResult<T>` with the same field names the hooks return (`data`, `error`, `status`, `isError`, `isSuccess`, `isLoading`, `isPending`, `isFetching`). It is type-safe where `UseQueryResult` is loose: `status` is a strict discriminant and the boolean flags are literal types, so `data` narrows to `T` exactly when `isSuccess` and `error` to `ApiClientError` exactly when `isError`. `isLoading`/`isPending`/`isFetching` are always `false` after `await` (the call is settled), kept for shape parity so a component can swap a hook call for a plain resource call.

Also added optional `parse` validators to `createResource` options - one per method (`list`, `getById`, `create`, `update`), applied to `response.data` at runtime before it's returned (works with zod schemas). A failing validator is normalized into an `ApiClientError` with `kind: "unknown"` and the original error as its cause. `custom()` accepts a per-call `parse` for its payload.