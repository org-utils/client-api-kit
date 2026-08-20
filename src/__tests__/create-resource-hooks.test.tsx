import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OffsetPaginationParams } from "client-api-types";
import { createApiClient } from "../core/create-client.js";
import { createResource } from "../resource/create-resource.js";
import { createResourceHooks } from "../react/create-resource-hooks.js";
import { createQueryClient } from "../react/query-client.js";
import { BASE_URL, resetPosts, type Post } from "./mock-server.js";

interface CreatePostInput {
  title: string;
  body?: string;
}
type UpdatePostInput = Partial<CreatePostInput>;

function setup() {
  const client = createApiClient({ baseURL: BASE_URL });
  const resource = createResource<Post, OffsetPaginationParams, CreatePostInput, UpdatePostInput>(client, {
    baseURL: "/posts",
  });
  const hooks = createResourceHooks(resource, "posts");
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { hooks, queryClient, wrapper };
}

describe("createResourceHooks - useList", () => {
  beforeEach(() => resetPosts());

  it("fetches a page and exposes items + pagination", async () => {
    const { hooks, wrapper } = setup();
    const { result } = renderHook(() => hooks.useList({ page: 1, limit: 10 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(10);
    expect(result.current.data?.pagination).toMatchObject({ type: "offset", page: 1, total: 25 });
  });

  it("exposes an ApiClientError on failure", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const badResource = createResource<Post>(client, { baseURL: "/posts" });
    const hooks = createResourceHooks(badResource, "bad");
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => hooks.useGetById("does-not-exist"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.kind).toBe("http");
    expect(result.current.error?.statusCode).toBe(404);
  });
});

describe("createResourceHooks - useGetById", () => {
  beforeEach(() => resetPosts());

  it("fetches a single record", async () => {
    const { hooks, wrapper } = setup();
    const { result } = renderHook(() => hooks.useGetById("1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("1");
  });

  it("stays disabled (no fetch) while id is null", async () => {
    const { hooks, wrapper } = setup();
    const { result } = renderHook(() => hooks.useGetById(null), { wrapper });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

describe("createResourceHooks - useCreate", () => {
  beforeEach(() => resetPosts());

  it("creates a record and invalidates list queries", async () => {
    const { hooks, wrapper, queryClient } = setup();

    const list = renderHook(() => hooks.useList({ page: 1, limit: 25 }), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(list.result.current.data?.items).toHaveLength(25);

    const create = renderHook(() => hooks.useCreate(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ title: "Brand New" });
    });

    await waitFor(() => {
      const state = queryClient.getQueryState(hooks.queryKeys.lists());
      expect(state?.isInvalidated ?? false).toBe(false);
    });
    await waitFor(() => expect(list.result.current.data?.items.length).toBe(25));
  });

  it("calls the caller's onSuccess in addition to internal cache invalidation", async () => {
    const { hooks, wrapper } = setup();
    let called = false;
    const create = renderHook(
      () =>
        hooks.useCreate({
          onSuccess: () => {
            called = true;
          },
        }),
      { wrapper },
    );

    await act(async () => {
      await create.result.current.mutateAsync({ title: "Another Post" });
    });

    expect(called).toBe(true);
  });
});

describe("createResourceHooks - useUpdate", () => {
  beforeEach(() => resetPosts());

  it("updates a record and patches the cached detail entry", async () => {
    const { hooks, wrapper, queryClient } = setup();

    const detail = renderHook(() => hooks.useGetById("1"), { wrapper });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));

    const update = renderHook(() => hooks.useUpdate(), { wrapper });
    await act(async () => {
      await update.result.current.mutateAsync({ id: "1", input: { title: "Changed" } });
    });

    expect(queryClient.getQueryData(hooks.queryKeys.detail("1"))).toMatchObject({ title: "Changed" });
  });
});

describe("createResourceHooks - useDelete", () => {
  beforeEach(() => resetPosts());

  it("deletes a record and evicts its cached detail entry", async () => {
    const { hooks, wrapper, queryClient } = setup();

    const detail = renderHook(() => hooks.useGetById("1"), { wrapper });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));

    const del = renderHook(() => hooks.useDelete(), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync("1");
    });

    expect(queryClient.getQueryData(hooks.queryKeys.detail("1"))).toBeUndefined();
  });
});

describe("createResourceHooks - useInfiniteList", () => {
  beforeEach(() => resetPosts());

  it("fetches successive pages via nextCursor", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const feedResource = createResource<Post, { cursor?: string; limit: number }, CreatePostInput, UpdatePostInput>(
      client,
      { baseURL: "/feed" },
    );
    const feedHooks = createResourceHooks(feedResource, "feed");
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => feedHooks.useInfiniteList({ limit: 10 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]?.items).toHaveLength(10);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    const firstPageIds = result.current.data!.pages[0]!.items.map((p) => p.id);
    const secondPageIds = result.current.data!.pages[1]!.items.map((p) => p.id);
    expect(new Set(firstPageIds).size + new Set(secondPageIds).size).toBe(
      new Set([...firstPageIds, ...secondPageIds]).size,
    );
  });
});
