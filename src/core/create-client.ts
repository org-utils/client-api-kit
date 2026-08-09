import axios, { type AxiosInstance, type AxiosRequestConfig, isAxiosError, RawAxiosRequestHeaders } from "axios";
import type { ApiClientConfig,ApiResponse, SuccessResponse  } from "client-api-types";
import { ApiClientError } from "../errors/ApiClientError.js";
import { withRetry } from "./retry.js";
type MaybePromise<T> = T | Promise<T>;
function normalizeHeaders(
  headers?: AxiosRequestConfig["headers"],
): AxiosRequestConfig["headers"] {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return headers;
}
export interface ApiClient {
  /** The underlying axios instance, for advanced/one-off use not covered by `request`. */
  readonly axios: AxiosInstance;
  /**
   * Performs a request and returns the unwrapped `SuccessResponse<T>` envelope
   * (so callers can read both `.data` and `.pagination`). Throws `ApiClientError`
   * for any failure - network, timeout, cancellation, or a server-returned
   * `ErrorResponse` - so callers only ever need one catch/error branch.
   */
  request<T>(config: AxiosRequestConfig): Promise<SuccessResponse<T>>;

  setHeaders(headers: (headers: Record<string, string>) => MaybePromise<Record<string, any> | undefined>): {
      readonly axios: AxiosInstance;
      request<T>(config: AxiosRequestConfig): Promise<SuccessResponse<T>>;
      setHeaders(headers: (headers: Record<string, string>) => MaybePromise<Record<string, any> | undefined>): ApiClient;
  }
}

/**
 * Creates a configured API client. Safe to call in any environment (server
 * component, server action, route handler, or client component) - it holds
 * no browser-only state. Typically you create one instance per base URL and
 * share it across `createResource(...)` calls.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  let headerGetter: () => MaybePromise<Record<string, any> | undefined> = () => undefined;
  let staticHeaders: RawAxiosRequestHeaders = normalizeHeaders(config.defaultHeaders || {}) as Record<string, string>;

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
    // 2. Add dynamic headers from headerGetter
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
    // 3. Add static headers (override if needed)
    // for (const [key, value] of Object.entries(staticHeaders)) {
    //   if (value !== undefined && value !== null) {
    //     // Only set if not already set by dynamic headers
    //     if (!requestConfig.headers.has(key)) {
    //       requestConfig.headers.set(key, value);
    //     }
    //   }
    // }
    return requestConfig;
  });

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
  // ✅ Set the header getter function
  function setHeaders(
    headers: (headers: Record<string, string>) => MaybePromise<Record<string, any> | undefined>
  ): ApiClient {
    headerGetter = () => headers({});
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

function isEnvelopeShape<T>(data: unknown): data is ApiResponse<T> {
  return typeof data === "object" && data !== null && "success" in data && typeof (data as { success: unknown }).success === "boolean";
}
