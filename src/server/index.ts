/**
 * `client-api-kit/server` - TanStack Query prefetch helpers for server
 * components, server actions, and client code alike. Unlike the react entry,
 * this module is NOT marked `"use client"`, so server components can import
 * it safely. Pair `createResourcePrefetcher` with `dehydrate` /
 * `HydrationBoundary` from `@tanstack/react-query` to warm the cache server-
 * side, or call the same functions on the client (e.g. before a navigation).
 */
export { createResourcePrefetcher } from "./create-resource-prefetcher.js";
export type { ResourcePrefetcher } from "./create-resource-prefetcher.js";
export { createQueryClient } from "../react/query-client.js";