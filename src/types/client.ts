import type { AxiosRequestConfig } from "axios";

/** Returns the current auth token, or null/undefined if there isn't one. Works for both a server (read cookies/headers) and a client (read memory/storage) token source. */
export type TokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

export interface RetryConfig {
  /** Number of retry attempts after the initial request. Default: 2. */
  retries?: number;
  /** Base delay in ms for exponential backoff (delay = base * 2^attempt, capped at 5s). Default: 300. */
  retryDelayMs?: number;
  /** HTTP status codes worth retrying. Default: [408, 429, 500, 502, 503, 504]. */
  retryOnStatusCodes?: number[];
  /** HTTP methods safe to retry (idempotent by convention). Default: ["get", "head", "options", "delete"]. */
  retryMethods?: string[];
}

export interface ApiClientConfig {
  /** Base URL every request is resolved against, e.g. "https://api.example.com". */
  baseURL: string;
  /** Supplies the bearer token for the Authorization header. Omit if you rely on cookie-based auth instead. */
  getAuthToken?: TokenProvider;
  /** Headers merged into every request (lowest precedence - per-request headers win). */
  defaultHeaders?: Record<string, string> ;
  /** Request timeout in ms. Default: 15000. */
  timeoutMs?: number;
  /** Automatic retry for transient failures. Pass `false` to disable entirely. */
  retry?: RetryConfig | false;
  /** Called when any request fails with 401, e.g. to trigger a token refresh or redirect to login. Not awaited by the request itself. */
  onUnauthorized?: () => void | Promise<void>;
  /** Escape hatch for any additional axios config (proxy, httpsAgent, adapter, ...). `baseURL`, `timeout`, and `headers` are managed by this client and ignored here. */
  axiosConfig?: Omit<AxiosRequestConfig, "baseURL" | "timeout" | "headers">;
}

export interface RequestOptions {
  /** Per-request headers, merged on top of `defaultHeaders` and the auth header. */
  headers?: Record<string, string>;
  /** Forwarded to axios for request cancellation - TanStack Query passes its own signal here automatically. */
  signal?: AbortSignal;
}
