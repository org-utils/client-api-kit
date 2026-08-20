import { describe, expect, it } from "vitest";
import { createQueryKeys } from "../resource/query-keys.js";

describe("createQueryKeys", () => {
  const keys = createQueryKeys<{ page: number; limit: number }>("posts");

  it("builds a hierarchical key structure", () => {
    expect(keys.all).toEqual(["posts"]);
    expect(keys.lists()).toEqual(["posts", "list"]);
    expect(keys.list({ page: 1, limit: 10 })).toEqual(["posts", "list", { page: 1, limit: 10 }]);
    expect(keys.details()).toEqual(["posts", "detail"]);
    expect(keys.detail("42")).toEqual(["posts", "detail", "42"]);
    expect(keys.custom("GET", "/export", { format: "json" })).toEqual([
      "posts",
      "custom",
      "GET",
      "/export",
      { format: "json" },
    ]);
    expect(keys.custom()).toEqual(["posts", "custom", undefined, undefined, undefined]);
  });

  it("produces distinct keys for distinct params (so caching doesn't collide)", () => {
    const a = keys.list({ page: 1, limit: 10 });
    const b = keys.list({ page: 2, limit: 10 });
    expect(a).not.toEqual(b);
  });

  it("scopes different resource names independently", () => {
    const userKeys = createQueryKeys<{ page: number }>("users");
    expect(userKeys.all).toEqual(["users"]);
    expect(keys.all).toEqual(["posts"]);
  });
});
