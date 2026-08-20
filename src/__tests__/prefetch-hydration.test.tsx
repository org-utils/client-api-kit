import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { dehydrate, HydrationBoundary, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OffsetPaginationParams } from "client-api-types";
import { createApiClient } from "../core/create-client.js";
import { createResource } from "../resource/create-resource.js";
import { createResourceHooks } from "../react/create-resource-hooks.js";
import { createResourcePrefetcher } from "../server/create-resource-prefetcher.js";
import { createQueryClient } from "../server/index.js";
import { BASE_URL, resetPosts, resetListRequests, listRequests, type Post } from "./mock-server.js";

interface CreatePostInput {
  title: string;
  body?: string;
}
type UpdatePostInput = Partial<CreatePostInput>;

describe("SSR prefetch + hydration", () => {
  beforeEach(() => {
    resetPosts();
    resetListRequests();
  });

  it("renders a client hook from server-prefetched cache without a second network request", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post, OffsetPaginationParams, CreatePostInput, UpdatePostInput>(client, {
      baseURL: "/posts",
    });

    // Server: fresh QueryClient per request, prefetch, then dehydrate.
    const serverQueryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    const prefetcher = createResourcePrefetcher(resource, "posts");
    await prefetcher.prefetchList(serverQueryClient, { page: 1, limit: 10 });
    const dehydratedState = dehydrate(serverQueryClient);

    // Client: brand-new QueryClient hydrated with the server state.
    const clientQueryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    const hooks = createResourceHooks(resource, "posts");

    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={clientQueryClient}>
          <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => hooks.useList({ page: 1, limit: 10 }), { wrapper });

    expect(result.current.data?.items).toHaveLength(10);
    expect(result.current.data?.pagination).toMatchObject({ type: "offset", page: 1, total: 25 });
    expect(clientQueryClient.isFetching()).toBe(0);

    await new Promise((r) => setTimeout(r, 50));
    expect(listRequests).toBe(1);
  });

  it("lets the client refetch once the prefetched cache entry is stale", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post, OffsetPaginationParams, CreatePostInput, UpdatePostInput>(client, {
      baseURL: "/posts",
    });

    const serverQueryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    const prefetcher = createResourcePrefetcher(resource, "posts");
    await prefetcher.prefetchList(serverQueryClient, { page: 1, limit: 10 });
    const dehydratedState = dehydrate(serverQueryClient);

    const clientQueryClient = createQueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    const hooks = createResourceHooks(resource, "posts");

    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={clientQueryClient}>
          <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => hooks.useList({ page: 1, limit: 10 }), { wrapper });

    await vi.waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(listRequests).toBe(2);
  });
});