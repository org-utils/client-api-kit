/**
 * `client-api-kit/react` - TanStack Query v5 hooks layer for client
 * components, built on the framework-agnostic resources from
 * `client-api-kit`. This entry is the only part of the package marked
 * `"use client"`. See the README for usage.
 */
export { createResourceHooks } from "./create-resource-hooks.js";
export type { ResourceHooks } from "./create-resource-hooks.js";
export { createQueryClient } from "./query-client.js";
export { ApiQueryProvider } from "./provider.js";
export type { ApiQueryProviderProps, DevtoolsProps } from "./provider.js";
