---
"client-api-kit": minor
---

Added `onError: "result"` to `createResource`: methods then resolve a typed `ResourceResult<T>` union (`{ success: true; data }` or `{ success: false; error: ApiClientError }`) instead of throwing, convenient for server components and server actions. The default `"throw"` mode is unchanged (and still required by the hooks layer).

Added optional `parse` validators to `createResource` options - one per method (`list`, `getById`, `create`, `update`), applied to `response.data` at runtime before it's returned (works with zod schemas). A failing validator is normalized into an `ApiClientError` with `kind: "unknown"` and the original error as its cause. `custom()` accepts a per-call `parse` for its payload.