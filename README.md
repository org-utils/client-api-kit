# client-api-kit

A generic, type-safe API client built on **axios**, paired with
[`client-api-types`](https://www.npmjs.com/package/client-api-types)'s
response envelope. Ships two
things:

- **Core** (`client-api-kit`) - a framework-agnostic HTTP client and
  generic CRUD "resources": plain async functions safe to call from a
  **server component**, a **server action**, a route handler, or any
  Node/Edge script.
- **React** (`client-api-kit/react`) - a **TanStack Query v5** hooks layer
  built on top of the same resources, for **client components**.

One resource definition, two ways to consume it.

```bash
npm install client-api-kit axios
npm install client-api-kit/react @tanstack/react-query react   # only if you use the hooks layer
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

export const usersResource = createResource<User, CreateUserInput, UpdateUserInput, OffsetPaginationParams>(
  apiClient,
  { basePath: "/users" },
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

```ts
import { ApiClientError } from "client-api-kit";

try {
  await usersResource.create(input);
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
export const postsFeed = createResource<Post, CreatePostInput, UpdatePostInput, { cursor?: string; limit: number }>(
  apiClient,
  { basePath: "/feed" },
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

Default retry policy: never retries 4xx (won't succeed on retry), retries
network/5xx errors up to twice, mutations never auto-retry.

## What's exported

| Module | Contents |
|---|---|
| `client-api-kit` | `createApiClient`, `createResource`, `createQueryKeys`, `ApiClientError`, all pagination/response types re-exported from `client-api-types` |
| `client-api-kit/react` | `createResourceHooks`, `createQueryClient`, `ApiQueryProvider` |

## Development

```bash
npm install
npm run typecheck
npm test        # 38 tests: client, resources (offset + cursor), provider, full hooks layer against a mock HTTP server
npm run build   # tsup -> dist/ (ESM + CJS + .d.ts), "use client" applied to the react entry only
```

Tests run against a real `msw` mock server (not stubbed function calls), and
the React hook tests render real hooks via `@testing-library/react` against
that server, including a genuine multi-page `useInfiniteList` round trip.
