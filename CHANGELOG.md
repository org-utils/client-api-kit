# client-api-kit

## 0.4.0

### Minor Changes

- [#14](https://github.com/org-utils/client-api-kit/pull/14) [`f1b3050`](https://github.com/org-utils/client-api-kit/commit/f1b3050d2175a9e9f1e6e2a631105b96bc2ddec9) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - `createResource` now defaults to the TanStack Query-shaped results mode (`mode: "query"` - see below) instead of throwing; pass `mode: "throw"` explicitly for the old rejecting behavior. The `onError` option is kept as a deprecated alias for `mode`.
  
  - `mode: "query"` (new default) - every method resolves a settled `QueryResult<T>` with the same field names the hooks return (`data`, `error`, `status`, `isError`, `isSuccess`, `isLoading`, `isPending`, `isFetching`). It is type-safe where `UseQueryResult` is loose: `status` is a strict discriminant and the boolean flags are literal types, so `data` narrows to `T` exactly when `isSuccess` and `error` to `ApiClientError` exactly when `isError`. `isLoading`/`isPending`/`isFetching` are always `false` after `await` (the call is settled), kept for shape parity so a component can swap a hook call for a plain resource call.
  - `mode: "result"` - every method resolves a typed `ResourceResult<T>` union (`{ success: true; data }` or `{ success: false; error: ApiClientError }`) instead of throwing.
  - New `setMode(mode)` method (like `setHeaders`/`setConfig`) switches the resource's mode at runtime and returns the same resource typed for the new mode; the switch is global to the resource.
  - `createResourceHooks` and `createResourcePrefetcher` are now mode-agnostic: they accept a resource in any mode and extract the payload (or throw the `ApiClientError`) from its result shape via the new exported `unwrapResourceResult` helper.
  
  Also added optional `parse` validators to `createResource` options - one per method (`list`, `getById`, `create`, `update`), applied to `response.data` at runtime before it's returned (works with zod schemas). A failing validator is normalized into an `ApiClientError` with `kind: "unknown"` and the original error as its cause. `custom()` accepts a per-call `parse` for its payload.

## 0.3.0

### Minor Changes

- [#14](https://github.com/org-utils/client-api-kit/pull/14) [`f1b3050`](https://github.com/org-utils/client-api-kit/commit/f1b3050d2175a9e9f1e6e2a631105b96bc2ddec9) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - Added two non-throwing modes to `createResource`, selected via the new `mode` option (default `"throw"`, unchanged; the earlier `onError` option is kept as a deprecated alias):
  
  - `mode: "result"` - every method resolves a typed `ResourceResult<T>` union (`{ success: true; data }` or `{ success: false; error: ApiClientError }`) instead of throwing, convenient for server components and server actions.
  - `mode: "query"` - every method resolves a settled, TanStack Query-shaped `QueryResult<T>` with the same field names the hooks return (`data`, `error`, `status`, `isError`, `isSuccess`, `isLoading`, `isPending`, `isFetching`). It is type-safe where `UseQueryResult` is loose: `status` is a strict discriminant and the boolean flags are literal types, so `data` narrows to `T` exactly when `isSuccess` and `error` to `ApiClientError` exactly when `isError`. `isLoading`/`isPending`/`isFetching` are always `false` after `await` (the call is settled), kept for shape parity so a component can swap a hook call for a plain resource call.
  
  Also added optional `parse` validators to `createResource` options - one per method (`list`, `getById`, `create`, `update`), applied to `response.data` at runtime before it's returned (works with zod schemas). A failing validator is normalized into an `ApiClientError` with `kind: "unknown"` and the original error as its cause. `custom()` accepts a per-call `parse` for its payload.

### Patch Changes

- [#12](https://github.com/org-utils/client-api-kit/pull/12) [`083f784`](https://github.com/org-utils/client-api-kit/commit/083f784d4105e2a1ac560931fc1d64c666ca557f) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - Update minor

## 0.2.0

### Minor Changes

- [#14](https://github.com/org-utils/client-api-kit/pull/14) [`f1b3050`](https://github.com/org-utils/client-api-kit/commit/f1b3050d2175a9e9f1e6e2a631105b96bc2ddec9) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - Added `onError: "result"` to `createResource`: methods then resolve a typed `ResourceResult<T>` union (`{ success: true; data }` or `{ success: false; error: ApiClientError }`) instead of throwing, convenient for server components and server actions. The default `"throw"` mode is unchanged (and still required by the hooks layer).
  
  Added optional `parse` validators to `createResource` options - one per method (`list`, `getById`, `create`, `update`), applied to `response.data` at runtime before it's returned (works with zod schemas). A failing validator is normalized into an `ApiClientError` with `kind: "unknown"` and the original error as its cause. `custom()` accepts a per-call `parse` for its payload.

### Patch Changes

- [#12](https://github.com/org-utils/client-api-kit/pull/12) [`083f784`](https://github.com/org-utils/client-api-kit/commit/083f784d4105e2a1ac560931fc1d64c666ca557f) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - updated version

## 0.1.0

### Minor Changes

- [#12](https://github.com/org-utils/client-api-kit/pull/12) [`9dae16a`](https://github.com/org-utils/client-api-kit/commit/9dae16a53d68a5526edac267e02d716c78a956d9) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - Added TanStack Query prefetch support via a new `client-api-kit/server` entry point (`createResourcePrefetcher`). Prefetch functions (`prefetchList`, `prefetchInfiniteList`, `prefetchGetById`, `prefetchCustom`) share the hooks' query keys, so they work server-side with `dehydrate`/`HydrationBoundary` (SSR hydration) and client-side before navigation. `createQueryClient` is now also exported from `client-api-kit/server`.
  
  Also reordered `createResource`'s generic type parameters to `<T, ListParams, CreateInput, UpdateInput>` and added a `custom` query-key builder to `createQueryKeys`.

### Patch Changes

- [#12](https://github.com/org-utils/client-api-kit/pull/12) [`083f784`](https://github.com/org-utils/client-api-kit/commit/083f784d4105e2a1ac560931fc1d64c666ca557f) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - added server prefetch

## 0.0.4

### Patch Changes

- [`47a5e40`](https://github.com/org-utils/client-api-kit/commit/47a5e40e500891bb1721a2082ce7805069c7c0d8) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - updated the package

## 0.0.3

### Patch Changes

- [`9babeee`](https://github.com/org-utils/client-api-kit/commit/9babeee9efe3f12255e988d0c63dda427b46c5aa) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - updated patch

## 0.0.2

### Patch Changes

- [#7](https://github.com/org-utils/client-api-kit/pull/7) [`0af8b50`](https://github.com/org-utils/client-api-kit/commit/0af8b50255ff83c32218222356d2be886561eadd) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - removed api-response-tsjs and added client-api-types

## 0.0.1

### Patch Changes

- [#6](https://github.com/org-utils/client-api-kit/pull/6) [`d502cda`](https://github.com/org-utils/client-api-kit/commit/d502cda18eb3ef1327b5c55a8314cd10704fe243) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - patching this

- [#4](https://github.com/org-utils/client-api-kit/pull/4) [`4ab3978`](https://github.com/org-utils/client-api-kit/commit/4ab3978053baa639ca761d52d9e218b52b69d868) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - updated dependencies

- [#1](https://github.com/org-utils/client-api-kit/pull/1) [`392d362`](https://github.com/org-utils/client-api-kit/commit/392d36247c012478bd87f38ac6ba12e128ec99dd) Thanks [@Anwarkamal143](https://github.com/Anwarkamal143)! - patched api client
