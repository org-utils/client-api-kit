import { describe, expect, it, beforeEach } from "vitest";
import { InfiniteData } from "@tanstack/react-query";
import type { OffsetPaginationParams, ListResult } from "client-api-types";
import { createApiClient } from "../core/create-client.js";
import { createResource } from "../resource/create-resource.js";
import { createResourcePrefetcher } from "../server/create-resource-prefetcher.js";
import { createQueryClient } from "../server/index.js";
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
  const prefetcher = createResourcePrefetcher(resource, "posts");
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return { prefetcher, queryClient };
}

describe("createResourcePrefetcher", () => {
  beforeEach(() => resetPosts());

  it("prefetches a list into the query cache under the same key the hook uses", async () => {
    const { prefetcher, queryClient } = setup();

    await prefetcher.prefetchList(queryClient, { page: 1, limit: 10 });

    const cached = queryClient.getQueryData<ListResult<Post>>(prefetcher.queryKeys.list({ page: 1, limit: 10 }));
    expect(cached).toMatchObject({ pagination: { type: "offset", page: 1, total: 25 } });
    expect(cached?.items).toHaveLength(10);
  });

  it("prefetches a single record into the query cache", async () => {
    const { prefetcher, queryClient } = setup();

    await prefetcher.prefetchGetById(queryClient, "1");

    const cached = queryClient.getQueryData(prefetcher.queryKeys.detail("1"));
    expect(cached).toMatchObject({ id: "1", title: "Post 1" });
  });

  it("prefetches the first infinite page into the query cache", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const feedResource = createResource<Post, { cursor?: string; limit: number }, CreatePostInput, UpdatePostInput>(
      client,
      { baseURL: "/feed" },
    );
    const prefetcher = createResourcePrefetcher(feedResource, "feed");
    const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });

    await prefetcher.prefetchInfiniteList(queryClient, { limit: 10 });

    const cached = queryClient.getQueryData<InfiniteData<{ items: Post[] }>>(
      prefetcher.queryKeys.infinite({ limit: 10 }),
    );
    expect(cached?.pages).toHaveLength(1);
    expect(cached?.pages[0]?.items).toHaveLength(10);
    expect(cached?.pageParams).toEqual([undefined]);
  });

  it("prefetches a custom endpoint into the query cache", async () => {
    const { prefetcher, queryClient } = setup();

    await prefetcher.prefetchCustom(queryClient, "GET", "/export", { params: { format: "json" } });

    const cached = queryClient.getQueryData<{ format: string | null; count: number }>(
      prefetcher.queryKeys.custom("GET", "/export", { format: "json" }),
    );
    expect(cached).toEqual({ format: "json", count: 25 });
  });

  it("stores failed prefetches as errors in the cache instead of throwing", async () => {
    const { prefetcher, queryClient } = setup();

    await prefetcher.prefetchGetById(queryClient, "does-not-exist");

    const state = queryClient.getQueryState(prefetcher.queryKeys.detail("does-not-exist"));
    expect(state?.error).toMatchObject({ kind: "http", statusCode: 404 });
  });
});