import axios, { type AxiosRequestConfig, isAxiosError, RawAxiosRequestHeaders } from "axios";
import type { ApiClient, ApiClientConfig, ApiResponse, SuccessResponse } from "client-api-types";
import { ApiClientError } from "../errors/ApiClientError.js";
import { withRetry } from "./retry.js";
import { normalizeHeaders } from "../utils/index.js";
/** A value that may be produced synchronously or asynchronously. */
type MaybePromise<T> = T | Promise<T>;

/**
 * Creates a configured API client. Safe to call in any environment (server
 * component, server action, route handler, or client component) - it holds
 * no browser-only state. Typically you create one instance per base URL and
 * share it across `createResource(...)` calls.
 *
 * @param config - Client configuration: `baseURL` (required), optional auth
 *   token provider, default headers, timeout, retry policy, an `onUnauthorized`
 *   hook, and an escape-hatch `axiosConfig`.
 * @returns An {@link ApiClient} wrapping a shared axios instance.
 *
 * @example
 * const api = createApiClient({
 *   baseURL: "https://api.example.com",
 *   getAuthToken: () => localStorage.getItem("token"),
 *   retry: { retries: 2 },
 *   onUnauthorized: () => window.location.assign("/login"),
 * });
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  /** Supplies per-request dynamic headers, installed via `setHeaders`. */
  let headerGetter: () => MaybePromise<Record<string, any> | undefined> = () => undefined;
  /** Headers configured at client-creation time via `config.defaultHeaders`. */
  const staticHeaders: RawAxiosRequestHeaders = normalizeHeaders(config.defaultHeaders || {}) as Record<string, string>;

  const instance = axios.create({
    baseURL: config.baseURL,
    timeout: config.timeoutMs ?? 15_000,
    ...(config.defaultHeaders ? {
      headers: {
        ...staticHeaders,
      }
    } : {}),
    ...config.axiosConfig,
  });

  instance.interceptors.request.use(async (requestConfig) => {
    // Dynamic headers from the header getter (set via setHeaders), then the auth token.
    const dynamicHeaders = await headerGetter?.();
    if (dynamicHeaders) {
      for (const [key, value] of Object.entries(dynamicHeaders)) {
        if (value !== undefined && value !== null) {
          requestConfig.headers.set(key, value);
        }
      }
    }
    if (config.getAuthToken) {
      const token = await config.getAuthToken();
      if (token) {
        requestConfig.headers.set("Authorization", `Bearer ${token}`);
      }
    }
    return requestConfig;
  });

  /**
   * Performs a request and returns the unwrapped `SuccessResponse<T>` envelope
   * (so callers can read both `.data` and `.pagination`). Throws
   * {@link ApiClientError} for any failure - network, timeout, cancellation,
   * or a server-returned `ErrorResponse` - so callers only ever need one
   * catch/error branch.
   *
   * @param requestConfig - An axios request config. `method` defaults to
   *   `"get"`. Envelope-shaped bodies are unwrapped; bare JSON payloads from
   *   third-party APIs are synthesized into a `SuccessResponse` automatically.
   * @returns The unwrapped success envelope for the response body.
   */
  async function request<T>(requestConfig: AxiosRequestConfig): Promise<SuccessResponse<T>> {
    const method = requestConfig.method ?? "get";

    try {
      const response = await withRetry(() => instance.request<unknown>(requestConfig), method, config.retry);
      return coerceToSuccessResponse<T>(response.data, response.status);
    } catch (error) {
      if (error instanceof ApiClientError) throw error;

      if (isAxiosError(error)) {
        const clientError = ApiClientError.fromAxiosError(error);
        if (clientError.statusCode === 401) {
          void config.onUnauthorized?.();
        }
        throw clientError;
      }

      throw ApiClientError.unknown(error);
    }
  }

  /**
   * Sets a function that supplies per-request headers. The callback receives
   * the current static headers (from `defaultHeaders`) and may return new
   * headers, which take precedence over the static ones. Calling `setHeaders`
   * again replaces the previous getter.
   *
   * @param headers - A function receiving the current static headers and
   *   returning (possibly async) the headers to add for every request.
   * @returns This same client, so calls can be chained.
   */
  function setHeaders(
    headers: (headers: Record<string, string>) => MaybePromise<Record<string, any> | undefined>
  ): ApiClient {
    headerGetter = () => headers({ ...staticHeaders } as Record<string, string>);
    return { axios: instance, request, setHeaders };
  }

  return { axios: instance, request, setHeaders };
}

/**
 * Accepts either a full `api-response-kit` envelope (the expected shape when
 * talking to a service built with it) or a bare payload (for third-party
 * APIs that don't use the envelope), and always returns a `SuccessResponse<T>`
 * so the rest of this package has exactly one shape to work with.
 */
function coerceToSuccessResponse<T>(raw: unknown, status: number): SuccessResponse<T> {
  if (isEnvelopeShape<T>(raw)) {
    if (raw.success) return raw;
    // A 2xx status with a success:false body is a contract violation from
    // the server, but we still want a clean typed error rather than
    // silently treating error.details as if they were `data`.
    throw ApiClientError.fromErrorResponse(raw);
  }

  return {
    success: true,
    statusCode: status,
    data: raw as T,
    meta: { timestamp: new Date().toISOString() },
  };
}

/**
 * Type guard for the `api-response`-style envelope shape: a plain object with
 * a boolean `success` property. Anything else (arrays, primitives, plain
 * JSON objects without `success`) is treated as a bare payload.
 *
 * @param data - The raw response body.
 * @returns `true` when `data` looks like an envelope.
 */
function isEnvelopeShape<T>(data: unknown): data is ApiResponse<T> {
  return typeof data === "object" && data !== null && "success" in data && typeof (data as { success: unknown }).success === "boolean";
}