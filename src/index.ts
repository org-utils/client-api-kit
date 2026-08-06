// Client
export { createApiClient } from "./core/create-client.js";
export type { ApiClient } from "./core/create-client.js";
export type { ApiClientConfig, RequestOptions, RetryConfig, TokenProvider } from "./types/client.js";

// Errors
export { ApiClientError } from "./errors/ApiClientError.js";
export type { ApiClientErrorKind, ApiClientErrorOptions } from "./errors/ApiClientError.js";

// Resource layer
export { createResource } from "./resource/create-resource.js";
export { createQueryKeys } from "./resource/query-keys.js";
export type { QueryKeyFactory } from "./resource/query-keys.js";
export type { CreateResourceOptions, ListResult, ResourceClient } from "./types/resource.js";

// Re-exported for convenience so consumers don't need a separate import from
// @dev_config/api-response just to type pagination params/results.
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
} from "@dev_config/api-response";
export { isOffsetPagination, isCursorPagination } from "@dev_config/api-response";
