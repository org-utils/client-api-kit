import { beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "../core/create-client.js";
import { createResource, type QueryResult } from "../resource/create-resource.js";
import { ApiClientError } from "../errors/ApiClientError.js";
import { isOffsetPagination } from "../utils/index.js";
import { BASE_URL, resetPosts, type Post } from "./mock-server.js";

interface CreatePostInput {
  title: string;
  body?: string;
}
type UpdatePostInput = Partial<CreatePostInput>;

interface OffsetPaginationParams {
  page?: number;
  limit?: number;
}

function buildResource() {
  const client = createApiClient({ baseURL: BASE_URL });
  return createResource<Post, OffsetPaginationParams, CreatePostInput, UpdatePostInput>(client, {
    baseURL: "/posts",
    mode: "query",
  });
}

describe("createResource - mode: 'query'", () => {
  beforeEach(() => resetPosts());

  it("list resolves a settled success result with items and pagination", async () => {
    const posts = buildResource();
    const result = await posts.list({ page: 1, limit: 10 });

    expect(result.status).toBe("success");
    if (result.isError) return;
    expect(result.isSuccess).toBe(true);
    expect(result.isError).toBe(false);
    expect(result.isLoading).toBe(false);
    expect(result.isPending).toBe(false);
    expect(result.isFetching).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data.items).toHaveLength(10);
    expect(isOffsetPagination(result.data.pagination)).toBe(true);
    if (isOffsetPagination(result.data.pagination)) {
      expect(result.data.pagination.total).toBe(25);
    }
  });

  it("getById resolves an error result with the normalized ApiClientError on 404", async () => {
    const posts = buildResource();
    const result = await posts.getById("does-not-exist");

    expect(result.status).toBe("error");
    if (!result.isError) return;
    expect(result.isSuccess).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(ApiClientError);
    expect(result.error.kind).toBe("http");
    expect(result.error.statusCode).toBe(404);
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("create resolves error with server details on 422 and success with the record otherwise", async () => {
    const posts = buildResource();

    const failed = await posts.create({ title: "" });
    expect(failed.status).toBe("error");
    if (!failed.isError) return;
    expect(failed.error.statusCode).toBe(422);
    expect(failed.error.details).toEqual([{ field: "title", message: "title is required" }]);

    const created = await posts.create({ title: "New Post" });
    expect(created.status).toBe("success");
    if (created.isError) return;
    expect(created.data.title).toBe("New Post");
  });

  it("update and remove resolve their success branches", async () => {
    const posts = buildResource();

    const updated = await posts.update("1", { title: "Updated" });
    expect(updated.status).toBe("success");
    if (updated.isError) return;
    expect(updated.data.title).toBe("Updated");

    const removed = await posts.remove("1");
    expect(removed.status).toBe("success");
    if (removed.isError) return;
    expect(removed.data).toBeNull();
  });

  it("never throws, even for network errors", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource(client, { baseURL: "/unreachable", mode: "query" });
    const result = await resource.custom();

    expect(result.status).toBe("error");
    if (!result.isError) return;
    expect(result.error.kind).toBe("network");
    expect(result.error.code).toBe("NETWORK_ERROR");
  });

  it("applies parse validators on success and normalizes failures into the error branch", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const posts = createResource<Post>(client, {
      baseURL: "/posts",
      mode: "query",
      parse: {
        getById: (data) => {
          if (typeof data !== "object" || data === null || typeof (data as Post).title !== "string") {
            throw new Error("Invalid post payload");
          }
          return data as Post;
        },
      },
    });

    const ok = await posts.getById("1");
    expect(ok.status).toBe("success");
    if (ok.isError) return;
    expect(ok.data.title).toBe("Post 1");

    const bad = await createResource<Post>(client, {
      baseURL: "/posts",
      mode: "query",
      parse: {
        getById: () => {
          throw new Error("Invalid post payload");
        },
      },
    }).getById("1");

    expect(bad.status).toBe("error");
    if (!bad.isError) return;
    expect(bad.error).toBeInstanceOf(ApiClientError);
    expect(bad.error.kind).toBe("unknown");
    expect(bad.error.message).toBe("Invalid post payload");
  });

  it("supports a per-call parser on custom requests", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post>(client, { baseURL: "/posts", mode: "query" });

    const result = await resource.custom("GET", "/export", {
      params: { format: "json" },
      parse: (data) => {
        if (typeof data !== "object" || data === null || typeof (data as { count: number }).count !== "number") {
          throw new Error("Invalid export payload");
        }
        return data as { format: string; count: number };
      },
    });

    expect(result.status).toBe("success");
    if (result.isError) return;
    expect(result.data.format).toBe("json");
    expect(result.data.count).toBe(25);
  });

  it("mode wins over the deprecated onError alias when both are given", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post>(client, { baseURL: "/posts", mode: "result", onError: "query" });

    const result = await resource.getById("1");
    expect("success" in result).toBe(true);
  });
});

describe("createResource - mode: 'query' compile-time narrowing", () => {
  it("narrows data and error through the result fields without assertions", async () => {
    const posts = buildResource();
    const result = await posts.getById("1");

    const render = (res: QueryResult<Post>) => {
      if (res.isError) {
        return `error: ${res.error.statusCode ?? res.error.kind}`;
      }
      return res.data.title;
    };

    expect(render(result)).toBe("Post 1");

    const failed = await posts.getById("nope");
    expect(render(failed)).toBe("error: 404");
  });
});