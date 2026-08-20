import { beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "../core/create-client.js";
import { createResource } from "../resource/create-resource.js";
import { ApiClientError } from "../errors/ApiClientError.js";
import { isOffsetPagination, isCursorPagination } from "../utils/index.js";
import { BASE_URL, resetPosts, type Post } from "./mock-server.js";

interface CreatePostInput {
  title: string;
  body?: string;
}
type UpdatePostInput = Partial<CreatePostInput>;

function buildResource() {
  const client = createApiClient({ baseURL: BASE_URL });
  return createResource<Post, CreatePostInput, UpdatePostInput>(client, { baseURL: "/posts" });
}

describe("createResource - offset-paginated list", () => {
  beforeEach(() => resetPosts());

  it("returns items and offset pagination metadata", async () => {
    const posts = buildResource();
    const result = await posts.list({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(10);
    expect(isOffsetPagination(result.pagination)).toBe(true);
    if (isOffsetPagination(result.pagination)) {
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    }
  });

  it("paginates correctly to the last page", async () => {
    const posts = buildResource();
    const result = await posts.list({ page: 3, limit: 10 });
    expect(result.items).toHaveLength(5);
    if (isOffsetPagination(result.pagination)) {
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    }
  });
});

describe("createResource - cursor-paginated feed", () => {
  beforeEach(() => resetPosts());

  it("returns items and cursor pagination metadata via a cursor-shaped basePath", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const feed = createResource<Post, CreatePostInput, UpdatePostInput, { cursor?: string; limit: number }>(client, {
      baseURL: "/feed",
    });

    const first = await feed.list({ limit: 10 });
    expect(first.items).toHaveLength(10);
    expect(isCursorPagination(first.pagination)).toBe(true);
    if (isCursorPagination(first.pagination)) {
      expect(first.pagination.hasNext).toBe(true);
      expect(first.pagination.nextCursor).not.toBeNull();

      const second = await feed.list({ cursor: first.pagination.nextCursor!, limit: 10 });
      expect(second.items).toHaveLength(10);
      expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    }
  });
});

describe("createResource - CRUD", () => {
  beforeEach(() => resetPosts());

  it("getById returns a single record", async () => {
    const posts = buildResource();
    const post = await posts.getById("1");
    expect(post.id).toBe("1");
  });

  it("getById throws ApiClientError for a missing record", async () => {
    const posts = buildResource();
    await expect(posts.getById("does-not-exist")).rejects.toBeInstanceOf(ApiClientError);
  });

  it("create posts a new record and returns it", async () => {
    const posts = buildResource();
    const created = await posts.create({ title: "New Post", body: "Hello" });
    expect(created.title).toBe("New Post");
    expect(created.id).toBeDefined();

    const fetched = await posts.getById(created.id);
    expect(fetched.title).toBe("New Post");
  });

  it("create surfaces ValidationError details from the server", async () => {
    const posts = buildResource();
    let err: ApiClientError | undefined;
    try {
      await posts.create({ title: "" } as CreatePostInput);
    } catch (e) {
      err = e as ApiClientError;
    }
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err?.statusCode).toBe(422);
    expect(err?.details).toEqual([{ field: "title", message: "title is required" }]);
  });

  it("update patches an existing record", async () => {
    const posts = buildResource();
    const updated = await posts.update("1", { title: "Updated Title" });
    expect(updated.title).toBe("Updated Title");
  });

  it("remove deletes a record", async () => {
    const posts = buildResource();
    await posts.remove("1");
    await expect(posts.getById("1")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("createResource - custom requests", () => {
  it("custom sends per-request options headers", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post, CreatePostInput, UpdatePostInput>(client, { baseURL: "" });

    const headers = await resource.custom<Record<string, string>>("GET", "/echo-headers", {
      options: { headers: { "X-Custom-Option": "option-value" } },
    });

    expect(headers["x-custom-option"]).toBe("option-value");
  });

  it("setHeaders applies resource-level headers to every request", async () => {
    const client = createApiClient({ baseURL: BASE_URL });
    const resource = createResource<Post, CreatePostInput, UpdatePostInput>(client, { baseURL: "" });
    resource.setHeaders(() => ({ "X-Resource-Header": "resource-value" }));

    const headers = await resource.custom<Record<string, string>>("GET", "/echo-headers");

    expect(headers["x-resource-header"]).toBe("resource-value");
  });
});
