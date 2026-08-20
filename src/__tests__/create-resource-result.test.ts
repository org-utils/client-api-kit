import { beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "../core/create-client.js";
import { createResource } from "../resource/create-resource.js";
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
    onError: "result",
  });
}

describe("createResource - onError: 'result'", () => {
  beforeEach(() => resetPosts());

  it("list resolves { success: true, data } with pagination on success", async () => {
    const posts = buildResource();
    const result = await posts.list({ page: 1, limit: 10 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(10);
    expect(isOffsetPagination(result.data.pagination)).toBe(true);
    if (isOffsetPagination(result.data.pagination)) {
      expect(result.data.pagination.total).toBe(25);
    }
  });

  it("getById resolves { success: false, error } with the normalized ApiClientError on 404", async () => {
    const posts = buildResource();
    const result = await posts.getById("does-not-exist");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(ApiClientError);
    expect(result.error.kind).toBe("http");
    expect(result.error.statusCode).toBe(404);
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.isOperational).toBe(true);
  });

  it("create resolves { success: false, error } with server details on 422", async () => {
    const posts = buildResource();
    const result = await posts.create({ title: "" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.statusCode).toBe(422);
    expect(result.error.details).toEqual([{ field: "title", message: "title is required" }]);
  });

  it("create resolves { success: true, data } with the created record on success", async () => {
    const posts = buildResource();
    const result = await posts.create({ title: "New Post" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe("New Post");
    expect(result.data.id).toBeDefined();
  });

  it("update and remove resolve their success branches", async () => {
    const posts = buildResource();

    const updated = await posts.update("1", { title: "Updated" });
    expect(updated.success).toBe(true);
    if (!updated.success) return;
    expect(updated.data.title).toBe("Updated");

    const removed = await posts.remove("1");
    expect(removed.success).toBe(true);
    if (!removed.success) return;
    expect(removed.data).toBeNull();
  });

  it("never throws, even for network errors", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource(client, { baseURL: "/unreachable", onError: "result" });
    const result = await resource.custom();

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe("network");
    expect(result.error.code).toBe("NETWORK_ERROR");
  });

  it("custom resolves { success: false, error } on server errors", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post>(client, { baseURL: "/posts", onError: "result" });
    const result = await resource.custom("GET", "/does-not-exist");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.statusCode).toBe(404);
  });
});

describe("createResource - runtime validation (parse)", () => {
  beforeEach(() => resetPosts());

  const titleGuard = (data: unknown): Post => {
    if (typeof data !== "object" || data === null || typeof (data as Post).title !== "string") {
      throw new Error("Invalid post payload");
    }
    return data as Post;
  };

  it("applies getById parser to response data in result mode", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const posts = createResource<Post, OffsetPaginationParams, CreatePostInput, UpdatePostInput>(client, {
      baseURL: "/posts",
      onError: "result",
      parse: { getById: titleGuard },
    });

    const result = await posts.getById("1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe("Post 1");
  });

  it("normalizes a failing parser into the error branch in result mode", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const posts = createResource<Post>(client, {
      baseURL: "/posts",
      onError: "result",
      parse: { getById: () => {
        throw new Error("Invalid post payload");
      } },
    });

    const result = await posts.getById("1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(ApiClientError);
    expect(result.error.kind).toBe("unknown");
    expect(result.error.message).toBe("Invalid post payload");
  });

  it("throws a normalized ApiClientError for a failing parser in throw mode", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const posts = createResource<Post>(client, {
      baseURL: "/posts",
      parse: {
        getById: () => {
          throw new Error("Invalid post payload");
        },
      },
    });

    await expect(posts.getById("1")).rejects.toMatchObject({ kind: "unknown", message: "Invalid post payload" });
  });

  it("applies the list parser to items before wrapping them in ListResult", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const posts = createResource<Post, OffsetPaginationParams>(client, {
      baseURL: "/posts",
      onError: "result",
      parse: {
        list: (data) => {
          if (!Array.isArray(data)) throw new Error("Expected an array");
          return data.map((item) => titleGuard(item));
        },
      },
    });

    const result = await posts.list({ page: 1, limit: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(5);
    expect(result.data.items[0]?.title).toBe("Post 1");
  });

  it("supports a per-call parser on custom requests, inferred from the parse function", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post>(client, { baseURL: "/posts", onError: "result" });

    const result = await resource.custom("GET", "/export", {
      params: { format: "json" },
      parse: (data) => {
        if (typeof data !== "object" || data === null || typeof (data as { count: number }).count !== "number") {
          throw new Error("Invalid export payload");
        }
        return data as { format: string; count: number };
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.format).toBe("json");
    expect(result.data.count).toBe(25);
  });
});