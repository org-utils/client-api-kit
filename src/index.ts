/**
 * `client-api-kit` - framework-agnostic HTTP client and generic CRUD
 * resources, safe to call from server components, server actions, route
 * handlers, or any Node/Edge script. See the README for usage.
 */

// Client
export { createApiClient } from "./core/create-client.js";
export type { ApiClient, ApiClientConfig, RequestOptions, RetryConfig, TokenProvider, ApiClientErrorOptions } from "client-api-types";

// Errors
export { ApiClientError } from "./errors/ApiClientError.js";
export type { ApiClientErrorKind } from "./errors/ApiClientError.js";

// Resource layer
export { createResource } from "./resource/create-resource.js";
export type {
  QueryResult,
  QueryResourceClient,
  ResourceResult,
  ResourceMode,
  ResourceErrorMode,
  ResourceParsers,
  SafeResourceClient,
} from "./resource/create-resource.js";
export { createQueryKeys } from "./resource/query-keys.js";
export type { QueryKeyFactory } from "./resource/query-keys.js";
export type { CreateResourceOptions, ListResult, ResourceClient } from "client-api-types";

// Re-exported for convenience so consumers don't need a separate import from
// client-api-types just to type pagination params/results.
export type {
  ApiResponse,
  SuccessResponse,
  ErrorResponse,
  ErrorDetail,
  PaginationMeta,
  OffsetPaginationMeta,
  OffsetPaginationParams,
  CursorPaginationMeta,
  CursorPaginationParams,
} from "client-api-types";
export { isOffsetPagination, isCursorPagination } from "./utils/index.js";
