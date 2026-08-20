# client-api-kit

A generic, type-safe API client built on **axios**, paired with
[`client-api-types`](https://www.npmjs.com/package/client-api-types)'s
response envelope. Ships three things:

- **Core** (`client-api-kit`) - a framework-agnostic HTTP client and
  generic CRUD "resources": plain async functions safe to call from a
  **server component**, a **server action**, a route handler, or any
  Node/Edge script.
- **React** (`client-api-kit/react`) - a **TanStack Query v5** hooks layer
  built on top of the same resources, for **client components**.
- **Server prefetch** (`client-api-kit/server`) - TanStack Query prefetch
  helpers sharing the hooks' query keys, for warming the cache server-side
  (SSR hydration) or client-side before a navigation.

One resource definition, three ways to consume it.

```bash
npm install client-api-kit axios
npm install client-api-kit @tanstack/react-query react          # only if you use the hooks layer
npm install -D @tanstack/react-query-devtools                 # optional, for the devtools overlay
```

> **Note:** `client-api-kit` depends on `client-api-types` (^0.0.2), a
> types-only package published to npm - it resolves automatically with a
> normal `npm install`.

## Why a split core/react package

Next.js App Router (and RSC generally) draws a hard line between server and
client code. A single resource object shouldn't force a `"use client"`
boundary onto code that only ever runs on the server. So:

- `client-api-kit` has **zero React dependency** - import it in a server
  component or a server action with no bundle-size or "use client" cost.
- `client-api-kit/react` re-exports the same resource through hooks, and is
  the *only* part of this package marked `"use client"`.

## Quick start

```ts
// lib/api/client.ts - shared by both server and client code
import { createApiClient } from "client-api-kit";

export const apiClient = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL!,
  getAuthToken: async () => {
    // Server: read from cookies()/headers(). Client: read from memory, a
    // client-side auth store, or omit this if you rely on cookie-based auth
    // that the browser attaches automatically.
    return getTokenSomehow();
  },
  retry: { retries: 2 },
  onUnauthorized: () => {
    // e.g. redirect to /login, or trigger a refresh-token flow
  },
});
```

```ts
// lib/api/users.ts - one resource definition, used everywhere
import { createResource, type OffsetPaginationParams } from "client-api-kit";
import { apiClient } from "./client";

export interface User { id: string; name: string; email: string; }
export interface CreateUserInput { name: string; email: string; }
export type UpdateUserInput = Partial<CreateUserInput>;

export const usersResource = createResource<User, OffsetPaginationParams, CreateUserInput, UpdateUserInput>(
  apiClient,
  { baseURL: "/users" },
);
```

### Server component / server action

```ts
// app/users/page.tsx (Server Component)
import { usersResource } from "@/lib/api/users";

export default async function UsersPage({ searchParams }: { searchParams: { page?: string } }) {
  const { items, pagination } = await usersResource.list({
    page: Number(searchParams.page ?? 1),
    limit: 20,
  });

  return (
    <ul>
      {items.map((u) => <li key={u.id}>{u.name}</li>)}
    </ul>
  );
}
```

```ts
// app/users/actions.ts
"use server";
import { usersResource } from "@/lib/api/users";
import { ApiClientError } from "client-api-kit";
import { revalidatePath } from "next/cache";

export async function createUser(input: { name: string; email: string }) {
  try {
    const user = await usersResource.create(input);
    revalidatePath("/users");
    return { success: true as const, user };
  } catch (err) {
    if (err instanceof ApiClientError) {
      return { success: false as const, message: err.message, details: err.details };
    }
    throw err;
  }
}
```

### Client component

```tsx
// app/providers.tsx
"use client";
import { ApiQueryProvider } from "client-api-kit/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ApiQueryProvider>{children}</ApiQueryProvider>;
}
```

### React Query Devtools

`ApiQueryProvider` accepts an `enableDevtools` flag - when on, it renders the
[`ReactQueryDevtools`](https://tanstack.com/query/latest/docs/framework/react/devtools)
overlay. `@tanstack/react-query-devtools` is an optional peer dependency and is
lazily imported, so it's never bundled into consumers that don't enable it:

```tsx
// app/providers.tsx
"use client";
import { ApiQueryProvider } from "client-api-kit/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApiQueryProvider enableDevtools devtoolsProps={{ position: "bottom" }}>
      {children}
    </ApiQueryProvider>
  );
}
```

`devtoolsProps` forwards any
[`ReactQueryDevtools` props](https://tanstack.com/query/latest/docs/framework/react/devtools)
(e.g. `position`, `initialIsOpen` - anything you set overrides the built-in
`initialIsOpen: false` default). Install the devtools package when you want
the overlay: `npm install -D @tanstack/react-query-devtools`

```tsx
// components/UserList.tsx
"use client";
import { createResourceHooks } from "client-api-kit/react";
import { usersResource } from "@/lib/api/users";

const userHooks = createResourceHooks(usersResource, "users");

export function UserList() {
  const { data, isPending, error } = userHooks.useList({ page: 1, limit: 20 });
  const createUser = userHooks.useCreate();

  if (isPending) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>; // error is a typed ApiClientError

  return (
    <div>
      <ul>{data.items.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
      <p>Page {data.pagination.type === "offset" ? data.pagination.page : "?"} of {data.pagination.type === "offset" ? data.pagination.totalPages : "?"}</p>
      <button
        disabled={createUser.isPending}
        onClick={() => createUser.mutate({ name: "New User", email: "new@example.com" })}
      >
        Add user
      </button>
    </div>
  );
}
```

## Prefetching (server + client)

The hooks layer fetches on the client. To skip that first network round trip,
warm the query cache *before* the client mounts using the same query keys the
hooks use, via `client-api-kit/server` (a non-`"use client"` entry, safe to
import from server components and server actions).

```bash
npm install client-api-kit @tanstack/react-query
```

```ts
// lib/api/users.ts
import { createResource, type OffsetPaginationParams } from "client-api-kit";
import { createResourcePrefetcher } from "client-api-kit/server";

export const usersResource = createResource<User, OffsetPaginationParams, CreateUserInput, UpdateUserInput>(apiClient, {
  baseURL: "/users",
});
// Same resource + name as createResourceHooks → keys line up, hydration works.
export const userPrefetcher = createResourcePrefetcher(usersResource, "users");
```

### In a server component (SSR hydration)

Create a fresh `QueryClient` per request, prefetch, `dehydrate` it, and pass
the state to a `HydrationBoundary` around the client component:

```tsx
// app/users/page.tsx (Server Component)
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createQueryClient } from "client-api-kit/server";
import { userPrefetcher } from "@/lib/api/users";

export default async function UsersPage({ searchParams }: { searchParams: { page?: string } }) {
  const queryClient = createQueryClient();
  await userPrefetcher.prefetchList(queryClient, {
    page: Number(searchParams.page ?? 1),
    limit: 20,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserList />
    </HydrationBoundary>
  );
}
```

`UserList`'s `useList({ page, limit: 20 })` then renders straight from the
hydrated cache - no loading flash, no duplicate request. A `staleTime` of 60s
is applied during prefetch by default so the data isn't instantly refetched on
mount; override it per call via the options argument. Failed prefetches never
throw (matching TanStack Query) - the error lands in the cache and is readable
via `queryClient.getQueryState(key).error`.

Available prefetchers, mirroring the hooks one-to-one:

| Prefetcher | Warmest query | Key |
|---|---|---|
| `prefetchList(queryClient, params?, options?)` | `useList` | `queryKeys.list(params)` |
| `prefetchInfiniteList(queryClient, params?, options?)` | `useInfiniteList` | `queryKeys.infinite(params)` (first page by default) |
| `prefetchGetById(queryClient, id, options?)` | `useGetById` | `queryKeys.detail(id)` |
| `prefetchCustom(queryClient, method?, path?, callOptions?, options?)` | custom endpoints | `queryKeys.custom(method, path, params)` |

Each returns the `queryKeys` factory too, so you can build keys manually for
custom cache operations.

### On the client (prefetch before navigation)

The same functions work in client event handlers with the shared `QueryClient`:

```tsx
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { userPrefetcher } from "@/lib/api/users";

export function PaginatedLink({ page }: { page: number }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await userPrefetcher.prefetchList(queryClient, { page, limit: 20 });
        router.push(`/users?page=${page}`);
      }}
    >
      Go to page {page}
    </button>
  );
}
```

## Core client

```ts
import { createApiClient } from "client-api-kit";

const client = createApiClient({
  baseURL: "https://api.example.com",
  timeoutMs: 15_000,
  getAuthToken: () => localStorage.getItem("token"),
  defaultHeaders: { "X-Client-Version": "1.0.0" },
  retry: { retries: 2, retryDelayMs: 300, retryOnStatusCodes: [408, 429, 500, 502, 503, 504] },
  onUnauthorized: () => { window.location.href = "/login"; },
});
```

- **Envelope-aware**: expects a `client-api-types`-shaped `{ success, data, ... }`
  body and unwraps it into `SuccessResponse<T>` (so you get `.data` *and*
  `.pagination` from one call). A bare, un-enveloped JSON body from a
  third-party API is still handled - it's synthesized into a `SuccessResponse`
  automatically, so you can point this client at APIs that don't use the
  envelope too.
- **Retry**: automatic exponential backoff (capped at 5s) for transient
  failures (network errors, 408/429/5xx), but **only on idempotent methods**
  (`GET`, `HEAD`, `OPTIONS`, `DELETE` by default) - `POST`/`PATCH` are never
  auto-retried, since retrying a possibly-already-applied mutation can
  duplicate side effects. Configure via `retry: { retryMethods: [...] }`, or
  disable entirely with `retry: false`.
- **Auth**: `getAuthToken` can be sync or async (e.g. `await cookies()` in a
  server action) and is called fresh on every request - no stale-token bugs
  from caching it once at client-creation time.

### Escape hatch

```ts
client.axios.get("/some/one-off/endpoint"); // full axios instance for anything the wrapper doesn't cover
```

## Error handling

Every failure - network error, timeout, cancellation, or a server-returned
`ErrorResponse` - normalizes to one type: `ApiClientError`.

With a `mode: "throw"` resource (or `unwrapResourceResult` on any other
mode's result) it arrives via try/catch:

```ts
import { ApiClientError } from "client-api-kit";

const users = createResource<User>(apiClient, { baseURL: "/users", mode: "throw" });

try {
  await users.create(input);
} catch (err) {
  if (err instanceof ApiClientError) {
    switch (err.kind) {
      case "network":
        // couldn't reach the server at all
        break;
      case "timeout":
        break;
      case "cancelled":
        // request was aborted (e.g. React Query refetch superseded it) - usually safe to ignore
        break;
      case "http":
        // err.statusCode, err.code (e.g. "VALIDATION_ERROR"), err.details (field errors)
        if (err.code === "VALIDATION_ERROR") {
          err.details?.forEach((d) => console.log(d.field, d.message));
        }
        break;
    }
    // err.isOperational is true for 4xx (safe to show err.message to the user);
    // false for network/timeout/5xx (show a generic message, log the real one).
  }
}
```

In React, this is just `error` from `useQuery`/`useMutation`, already typed
as `ApiClientError`:

```tsx
const { error } = userHooks.useGetById(id);
if (error?.code === "NOT_FOUND") return <NotFoundPage />;
```

## Modes: `"query"`, `"result"`, `"throw"`

The `mode` option (default `"query"`) controls what each method resolves
to - so a `try/catch` is never forced on you in server components, server
actions, or route handlers:

| `mode` | Method return type | On failure |
|---|---|---|
| `"query"` (default) | `Promise<QueryResult<T>>` | TanStack Query-shaped `{ data, error, isError, ... }` - never throws |
| `"result"` | `Promise<ResourceResult<T>>` | `{ success: false; error: ApiClientError }` - never throws |
| `"throw"` | `Promise<T>` | Rejects with `ApiClientError` |

`mode: "result"` - every method returns a typed
`{ success: true; data } | { success: false; error }` union:

```ts
import { createResource } from "client-api-kit";

const users = createResource<User>(apiClient, {
  baseURL: "/users",
  mode: "result", // methods resolve ResourceResult<T> - they never throw
});

export async function updateName(id: string, name: string) {
  const res = await users.update(id, { name });
  if (!res.success) return res.error.message; // error: ApiClientError
  return res.data; // data: User
}
```

Narrow with a single `if (result.success)` check - `data` is fully typed in
the success branch, `error` is an `ApiClientError` (`kind`, `statusCode`,
`code`, `details`) in the failure branch. `list` resolves
`ResourceResult<ListResult<T>>`, `remove` resolves `ResourceResult<null>`.

## Query-style results (`mode: "query"` - the default)

Every method resolves a settled, **TanStack Query-shaped** object - the same
field names the hooks return (`data`, `error`, `isError`, `isSuccess`,
`isLoading`, `isPending`, `isFetching`) - but type-safe: `status` is a strict
discriminant and the boolean flags are literal types, so the compiler knows
`data` exists exactly when `isSuccess`, and `error` exactly when `isError`.
No `data: T | undefined` looseness, no manual assertions. No `mode` option is
needed - this is the default:

```ts
// lib/api/products.ts - one resource definition, used everywhere
import { createResource, type OffsetPaginationParams } from "client-api-kit";

export const productResource = createResource<Product, OffsetPaginationParams>(apiClient, {
  baseURL: "/api/v1/products",
  // mode defaults to "query"
});
```

```ts
// app/products/[id]/page.tsx - a server component
export default async function ProductPage({ params }: { params: { id: string } }) {
  const res = await productResource.getById(params.id);

  if (res.isError) {
    // res.error is fully typed here: ApiClientError
    if (res.error.code === "NOT_FOUND") return <NotFound />;
    return <ErrorMessage message={res.error.message} />;
  }

  return <ProductDetail product={res.data} />; // res.data is Product
}
```

```ts
// app/products/[id]/actions.ts - a server action
export async function renameProduct(id: string, name: string) {
  const res = await productResource.update(id, { name });
  return res.isError ? { ok: false, message: res.error.message } : { ok: true, product: res.data };
}
```

Because the shape matches the hooks' result field-for-field, a component can
swap `useProductHooks.useGetById(id)` for `await productResource.getById(id)`
(and back) without touching any field access. `isPending`/`isLoading`/
`isFetching` are always `false` - after `await` the call is settled, so the
type model has no in-flight state; the fields exist purely for parity.

## Switching modes at runtime (`setMode`)

`setMode` works like `setHeaders`/`setConfig`: it switches the resource's
mode on the fly, and returns the same resource typed for the new mode so the
call site gets the precise contract. The switch is global - every handle
created from the resource (including ones captured earlier) sees it.

```ts
const users = createResource<User>(apiClient, { baseURL: "/users" }); // "query"

const safe = users.setMode("result"); // SafeResourceClient<User>
const res = await safe.update(id, { name });
if (!res.success) return res.error.message; // error: ApiClientError

users.setMode("throw"); // rejects with ApiClientError again
```

## Hooks and prefetching work in any mode

`createResourceHooks` and `createResourcePrefetcher` are mode-agnostic: they
extract the payload (or throw the `ApiClientError`) from whatever result
shape the resource is in via `unwrapResourceResult`, so the same resource
definition works for server components, server actions, and client hooks
without a second instance.

```ts
export const productResource = createResource<Product>(apiClient, { baseURL: "/api/v1/products" });

// client components - TanStack Query cache, invalidation, prefetching
export const productHooks = createResourceHooks(productResource, "products");
export const productPrefetcher = createResourcePrefetcher(productResource, "products");

// server components / actions - the same resource, query-shaped results
const res = await productResource.getById(id);
```

## Runtime validation (`parse`)

The generics are compile-time only. To validate what the server actually
returns at runtime, pass `parse` validators - one per method - applied to
`response.data` before it's returned. Plain functions or zod schemas work:

```ts
import { createResource } from "client-api-kit";
import { z } from "zod";

const userSchema = z.object({ id: z.string(), name: z.string() });

const users = createResource<User>(apiClient, {
  baseURL: "/users",
  parse: {
    getById: (data) => userSchema.parse(data), // throws ZodError on mismatch
    list: (data) => z.array(userSchema).parse(data),
  },
});
```

A validator that throws (zod's `parse` does) is normalized into an
`ApiClientError` with `kind: "unknown"` and the original error as its cause
- it rejects in `"throw"` mode or lands in the `error` branch in
`"result"`/`"query"` mode, exactly like any other failure. `custom()` takes
its own per-call `parse` (its payload type `R` varies per call).

## Pagination

Both styles from `client-api-types` are supported end-to-end.

### Offset

```ts
const { items, pagination } = await usersResource.list({ page: 2, limit: 20 });
// pagination: { type: "offset", page, limit, total, totalPages, hasNext, hasPrev }
```

```tsx
const { data } = userHooks.useList({ page, limit: 20 }); // keepPreviousData is on by default - no loading flash between pages
```

### Cursor (infinite lists / feeds)

Define the resource's `ListParams` as cursor-shaped (`{ cursor?: string; limit: number }`,
optionally with your own filters), then use `useInfiniteList`:

```ts
export const postsFeed = createResource<Post, { cursor?: string; limit: number }, CreatePostInput, UpdatePostInput>(
  apiClient,
  { baseURL: "/feed" },
);
export const feedHooks = createResourceHooks(postsFeed, "feed");
```

```tsx
function Feed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = feedHooks.useInfiniteList({ limit: 20 });

  return (
    <>
      {data?.pages.map((page) => page.items.map((post) => <PostCard key={post.id} post={post} />))}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          Load more
        </button>
      )}
    </>
  );
}
```

## Generic CRUD hooks reference

`createResourceHooks(resource, resourceName)` returns:

| Hook | Backed by | Cache behavior |
|---|---|---|
| `useList(params?, options?)` | `useQuery` | `keepPreviousData` on by default |
| `useInfiniteList(params?, options?)` | `useInfiniteQuery` | paginates via `nextCursor`/`prevCursor` |
| `useGetById(id, options?)` | `useQuery` | auto-disabled while `id` is null/undefined |
| `useCreate(options?)` | `useMutation` | invalidates all list/infinite queries for this resource |
| `useUpdate(options?)` | `useMutation` | invalidates lists + patches the cached detail entry |
| `useDelete(options?)` | `useMutation` | invalidates lists + evicts the cached detail entry |

Every hook accepts the underlying TanStack Query options object and merges
with the built-in behavior - your `onSuccess`/`onError`/`staleTime`/etc. all
still fire; the library only adds the cache invalidation on top for
mutations, and a `keepPreviousData` default for `useList`.

`queryKeys` is also exposed on the returned object for manual cache
operations: `userHooks.queryKeys.detail(id)`, `userHooks.queryKeys.lists()`, etc.

## `createQueryClient` / `ApiQueryProvider`

```ts
import { createQueryClient } from "client-api-kit/react";

const queryClient = createQueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } }, // merge in your own overrides
});
```

`createQueryClient` is also exported from `client-api-kit/server` (no
`"use client"`), for building the per-request server QueryClient used in the
prefetch pattern above.

Default retry policy: never retries 4xx (won't succeed on retry), retries
network/5xx errors up to twice, mutations never auto-retry.

## What's exported

| Module | Contents |
|---|---|
| `client-api-kit` | `createApiClient`, `createResource`, `unwrapResourceResult`, `createQueryKeys`, `ApiClientError`, `QueryResult`/`QueryResourceClient`/`ResourceResult`/`SafeResourceClient`/`ThrowResourceClient`/`AnyResourceClient`/`ResourceMode`/`ResourceParsers` types, all pagination/response types re-exported from `client-api-types` |
| `client-api-kit/react` | `createResourceHooks`, `createQueryClient`, `ApiQueryProvider` |
| `client-api-kit/server` | `createResourcePrefetcher`, `createQueryClient` |

## Development

```bash
npm install
npm run typecheck
npm test        # 72 tests: client, resources (modes + setMode + validation), provider, hooks layer, prefetch + hydration against a mock HTTP server
npm run build   # tsup -> dist/ (ESM + CJS + .d.ts), "use client" applied to the react entry only
```

Tests run against a real `msw` mock server (not stubbed function calls), and
the React hook tests render real hooks via `@testing-library/react` against
that server, including a genuine multi-page `useInfiniteList` round trip.
