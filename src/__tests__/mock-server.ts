import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export interface Post {
  id: string;
  title: string;
  body: string;
}

export const BASE_URL = "https://api.test.local";

let posts: Post[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i + 1),
  title: `Post ${i + 1}`,
  body: `Body ${i + 1}`,
}));

export function resetPosts(): void {
  posts = Array.from({ length: 25 }, (_, i) => ({
    id: String(i + 1),
    title: `Post ${i + 1}`,
    body: `Body ${i + 1}`,
  }));
}

function successEnvelope<T>(data: T, extra: Record<string, unknown> = {}) {
  return { success: true, statusCode: 200, data, meta: { timestamp: new Date().toISOString() }, ...extra };
}

function errorEnvelope(statusCode: number, code: string, message: string, details?: unknown[]) {
  return {
    success: false,
    statusCode,
    error: { code, message, ...(details ? { details } : {}) },
    meta: { timestamp: new Date().toISOString() },
  };
}

/** Counts how many times the flaky endpoint has been hit, to test retry behavior. */
export let flakyAttempts = 0;
export function resetFlakyAttempts(): void {
  flakyAttempts = 0;
}

/** Counts how many times the always-fails POST endpoint has been hit, to test that non-idempotent methods aren't retried. */
export let postAttempts = 0;
export function resetPostAttempts(): void {
  postAttempts = 0;
}

export const handlers = [
  // Offset-paginated list
  http.get(`${BASE_URL}/posts`, ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const page = Number(url.searchParams.get("page") ?? 1);
    const start = (page - 1) * limit;
    const items = posts.slice(start, start + limit);
    const totalPages = Math.ceil(posts.length / limit);

    return HttpResponse.json(
      successEnvelope(items, {
        pagination: {
          type: "offset",
          page,
          limit,
          total: posts.length,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      }),
    );
  }),

  // Cursor-paginated feed (separate endpoint - deliberately distinct from
  // the offset-paginated /posts above, since a bare query string can't tell
  // "no cursor yet" apart from "not using cursor pagination at all").
  http.get(`${BASE_URL}/feed`, ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const cursor = url.searchParams.get("cursor");
    const startIndex = cursor ? Number(Buffer.from(cursor, "base64url").toString("utf8").match(/\d+/)?.[0] ?? 0) : 0;
    const slice = posts.slice(startIndex, startIndex + limit + 1);
    const hasNext = slice.length > limit;
    const items = hasNext ? slice.slice(0, limit) : slice;
    const nextCursor = hasNext ? Buffer.from(JSON.stringify({ id: startIndex + limit })).toString("base64url") : null;

    return HttpResponse.json(
      successEnvelope(items, {
        pagination: {
          type: "cursor",
          limit,
          nextCursor,
          prevCursor: cursor ? "prev" : null,
          hasNext,
          hasPrev: Boolean(cursor),
        },
      }),
    );
  }),

  http.get(`${BASE_URL}/posts/:id`, ({ params }) => {
    const post = posts.find((p) => p.id === params.id);
    if (!post) {
      return HttpResponse.json(errorEnvelope(404, "NOT_FOUND", `Post ${params.id} not found`), { status: 404 });
    }
    return HttpResponse.json(successEnvelope(post));
  }),

  http.post(`${BASE_URL}/posts`, async ({ request }) => {
    const body = (await request.json()) as { title?: string; body?: string };
    if (!body.title) {
      return HttpResponse.json(
        errorEnvelope(422, "VALIDATION_ERROR", "Invalid input", [{ field: "title", message: "title is required" }]),
        { status: 422 },
      );
    }
    const newPost: Post = { id: String(posts.length + 1), title: body.title, body: body.body ?? "" };
    posts.push(newPost);
    return HttpResponse.json(successEnvelope(newPost, { statusCode: 201 }), { status: 201 });
  }),

  http.patch(`${BASE_URL}/posts/:id`, async ({ params, request }) => {
    const post = posts.find((p) => p.id === params.id);
    if (!post) {
      return HttpResponse.json(errorEnvelope(404, "NOT_FOUND", `Post ${params.id} not found`), { status: 404 });
    }
    const body = (await request.json()) as Partial<Post>;
    Object.assign(post, body);
    return HttpResponse.json(successEnvelope(post));
  }),

  http.delete(`${BASE_URL}/posts/:id`, ({ params }) => {
    const index = posts.findIndex((p) => p.id === params.id);
    if (index === -1) {
      return HttpResponse.json(errorEnvelope(404, "NOT_FOUND", `Post ${params.id} not found`), { status: 404 });
    }
    posts.splice(index, 1);
    return HttpResponse.json(successEnvelope(null));
  }),

  // Auth-aware endpoint - echoes back the Authorization header it received
  http.get(`${BASE_URL}/whoami`, ({ request }) => {
    const auth = request.headers.get("authorization");
    return HttpResponse.json(successEnvelope({ authorization: auth }));
  }),

  // Echoes back the request headers it received - for testing header merging
  http.get(`${BASE_URL}/echo-headers`, ({ request }) => {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return HttpResponse.json(successEnvelope(headers));
  }),

  // Always network-errors, for testing the network-error path
  http.get(`${BASE_URL}/unreachable`, () => {
    return HttpResponse.error();
  }),

  // Fails with 500 the first two times, then succeeds - for testing retry
  http.get(`${BASE_URL}/flaky`, () => {
    flakyAttempts += 1;
    if (flakyAttempts < 3) {
      return HttpResponse.json(errorEnvelope(503, "SERVICE_UNAVAILABLE", "temporarily down"), { status: 503 });
    }
    return HttpResponse.json(successEnvelope({ ok: true, attempts: flakyAttempts }));
  }),

  // Always 400 - for testing that non-retryable statuses are NOT retried
  http.get(`${BASE_URL}/always-bad-request`, () => {
    flakyAttempts += 1;
    return HttpResponse.json(errorEnvelope(400, "BAD_REQUEST", "nope"), { status: 400 });
  }),

  // Always 503 on POST - for testing that POST is NOT retried by default (non-idempotent)
  http.post(`${BASE_URL}/always-fails-post`, () => {
    postAttempts += 1;
    return HttpResponse.json(errorEnvelope(503, "SERVICE_UNAVAILABLE", "down"), { status: 503 });
  }),

  // Bare, unenveloped payload - for testing the fallback coercion path
  http.get(`${BASE_URL}/unenveloped`, () => {
    return HttpResponse.json({ plain: "payload", nested: { value: 1 } });
  }),
];

export const server = setupServer(...handlers);
