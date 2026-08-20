import { RawAxiosRequestHeaders, type AxiosRequestConfig } from "axios";

import type { ApiClient, ListResult, ResourceClient } from "client-api-types/client";
import type { RequestOptions, SuccessResponse } from "client-api-types";
import { isDefined, normalizeHeaders, safeNormalizeUrl } from "../utils/index.js";

/** Pagination metadata used when the server returns a list without any. */
const EMPTY_OFFSET_PAGINATION = {
  type: "offset" as const,
  page: 1,
  limit: 0,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

/** Axios-level config allowed on a resource, minus `baseURL` (the path lives in `CreateResourceOptions`). */
type ResourceConfig = Omit<AxiosRequestConfig, "baseURL">;

/** Options accepted by `createResource`: the resource path plus any extra axios config. */
type CreateResourceOptions = AxiosRequestConfig & {
  /** Path relative to the client's baseURL, e.g. "/users". */
  baseURL: string;
};

/** A value that may be produced synchronously or asynchronously. */
type MaybePromise<T> = T | Promise<T>;

/**
 * Creates a generic CRUD resource bound to `client` and a base path. The
 * returned object is framework-agnostic: plain async functions safe to call
 * from a server component, a server action, a route handler, or client code.
 * Pair it with `createResourceHooks` (from `client-api-kit/react`) to get a
 * TanStack Query hooks layer over the same resource.
 *
 * @typeParam T - The record type this resource manages.
 * @typeParam ListParams - Query params for `list`, typically offset or cursor
 *   pagination params (optionally with filters). Defaults to `Record<string, unknown>`.
 * @typeParam CreateInput - Payload type for `create`. Defaults to `Partial<T>`.
 * @typeParam UpdateInput - Payload type for `update`. Defaults to `Partial<T>`.
 * @param client - The shared {@link ApiClient} to issue requests through.
 * @param options - `{ baseURL: "/users", ... }` - the resource path plus any
 *   axios request config to apply to every request (e.g. `params`, `headers`).
 * @returns A {@link ResourceClient} with `list`, `getById`, `create`, `update`,
 *   `remove`, `custom`, and runtime configuration setters.
 *
 * @example
 * const users = createResource<User, OffsetPaginationParams, CreateUserInput, UpdateUserInput>(
 *   apiClient,
 *   { baseURL: "/users" },
 * );
 * const page = await users.list({ page: 1, limit: 20 });
 */
export function createResource<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
>(
  client: ApiClient,
  options: CreateResourceOptions,
): ResourceClient<T, CreateInput, UpdateInput, ListParams> {
  const { baseURL: basePath, ...initialConfig } = options;
  /** The client used for requests; replaceable at runtime via `setClient`. */
  let rClient = client;
  /** Base config merged into every request; replaceable via `setConfig`. */
  let config: ResourceConfig = {
    ...initialConfig,
  };
  /** Resource-level header getter, installed via `setHeaders`. */
  let headers: () => MaybePromise<Partial<Record<string, any>>> | undefined;

  /**
   * Merges several header sources into one plain object, with later sources
   * winning on key conflicts. Accepts plain objects and WHATWG `Headers`.
   *
   * @param headers - Header sources, lowest precedence first.
   * @returns A single merged header record.
   */
  function mergeHeaders(
    ...headers: (AxiosRequestConfig["headers"] | undefined)[]
  ): RawAxiosRequestHeaders {
    const merged: RawAxiosRequestHeaders = {};

    for (const h of headers) {
      if (!h) continue;

      if (h instanceof Headers) {
        Object.assign(merged, Object.fromEntries(h.entries()));
      } else {
        Object.assign(merged, h);
      }
    }

    return merged;
  }

  /**
   * Merges a base resource config with overrides, combining `headers` and
   * `params` instead of replacing them.
   *
   * @param base - The current resource config.
   * @param override - The partial config to apply on top.
   * @returns The merged config.
   */
  function mergeConfig(
    base: ResourceConfig,
    override: Partial<ResourceConfig>,
  ): ResourceConfig {
    return {
      ...base,
      ...override,

      headers: mergeHeaders(
        normalizeHeaders(base.headers),
        normalizeHeaders(override.headers),
      ),

      params: {
        ...(base.params ?? {}),
        ...(override.params ?? {}),
      },
    };
  }

  /**
   * Executes a request through the resource's client, layering the resource
   * config, resource-level headers, and per-call params onto the request.
   *
   * @param request - The per-call axios request config.
   * @returns The unwrapped success envelope.
   */
  async function execute<R>(
    request: AxiosRequestConfig,
  ): Promise<SuccessResponse<R>> {
    const resolved = await headers?.();
    return rClient.request<R>({
      ...config,
      ...request,

      headers: mergeHeaders(
        normalizeHeaders(rClient.axios.defaults.headers.common),
        normalizeHeaders(config.headers),
        normalizeHeaders(resolved),
        normalizeHeaders(request.headers),
      ),

      params: {
        ...(config.params ?? {}),
        ...(request.params ?? {}),
      },
    });
  }

  const resource: ResourceClient<T, CreateInput, UpdateInput, ListParams> = {
    /**
     * Fetches a paginated list of records.
     *
     * @param params - Query params (page/limit, cursor, filters, ...).
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The list items plus their pagination metadata.
     */
    async list(params, requestOptions): Promise<ListResult<T>> {
      const response = await execute<T[]>({
        method: "GET",
        url: basePath,
        params,
        ...toAxiosOptions(requestOptions),
      });

      return {
        items: response.data,
        pagination: response.pagination ?? EMPTY_OFFSET_PAGINATION,
      };
    },

    /**
     * Fetches a single record by id.
     *
     * @param id - The record's id. Falsy ids (undefined/null/empty) request
     *   the base path itself rather than a malformed URL.
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The record.
     */
    async getById(id, requestOptions): Promise<T> {
      const response = await execute<T>({
        method: "GET",
        url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

    /**
     * Creates a record with a POST to the base path.
     *
     * @param input - The creation payload.
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The created record as returned by the server.
     */
    async create(input, requestOptions): Promise<T> {
      const response = await execute<T>({
        method: "POST",
        url: basePath,
        data: input,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

    /**
     * Partially updates a record with a PATCH to `/basePath/:id`.
     *
     * @param id - The record's id.
     * @param input - The update payload (merged server-side).
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The updated record as returned by the server.
     */
    async update(id, input, requestOptions): Promise<T> {
      const response = await execute<T>({
        method: "PATCH",
        url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
        data: input,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

    /**
     * Deletes a record with a DELETE to `/basePath/:id`.
     *
     * @param id - The record's id.
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns Resolves once the server confirms deletion.
     */
    async remove(id, requestOptions): Promise<void> {
      await execute({
        method: "DELETE",
        url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
        ...toAxiosOptions(requestOptions),
      });
    },

    /**
     * Escape hatch for endpoints that don't fit the CRUD shape. Issues an
     * arbitrary method against `/basePath/:path`.
     *
     * @typeParam R - The response payload type. Defaults to `unknown`.
     * @param method - HTTP method. Defaults to `"GET"`.
     * @param path - Path appended to the base path (normalized: leading slash
     *   added, double slashes collapsed). Defaults to the base path itself.
     * @param options - Request body, query params, and per-call headers/signal.
     * @returns The raw response payload.
     *
     * @example
     * await users.custom("POST", "/import", { data: csvPayload, options: { headers: { "Content-Type": "text/csv" } } });
     */
    async custom<R = unknown>(
      method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
      path?: string,
      options?: {
        data?: any;
        params?: Record<string, any>;
        options?: RequestOptions;
      },
    ): Promise<R> {
      const { data, params, options: requestOptions } = options ?? {};

      const response = await execute<R>({
        method,
        url: `${basePath}${safeNormalizeUrl(path)}`,
        data,
        params,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

    /**
     * Replaces the resource's base config at runtime. Accepts a partial config
     * or a function receiving the current (frozen) config. Headers and params
     * are merged with the existing ones; other fields are replaced.
     *
     * @param newConfig - Partial config, or a (possibly async) function
     *   computing one from the current config.
     * @returns This same resource, so calls can be chained.
     */
    async setConfig(
      newConfig:
        | Partial<ResourceConfig>
        | ((
            current: Readonly<ResourceConfig>,
          ) => MaybePromise<Partial<ResourceConfig>>),
    ) {
      const resolved =
        typeof newConfig === "function"
          ? await newConfig(Object.freeze({ ...config }))
          : newConfig;

      config = mergeConfig(config, {
        ...resolved,
        ...(resolved.headers
          ? {
              headers: normalizeHeaders(resolved.headers) as Record<
                string,
                any
              >,
            }
          : {}),
      });

      return resource;
    },

    /**
     * Swaps the underlying API client at runtime (e.g. after a token source
     * change or to point at a different base URL).
     *
     * @param newClient - The client to use for subsequent requests.
     * @returns This same resource, so calls can be chained.
     */
    setClient(newClient: ApiClient) {
      rClient = newClient;

      return resource;
    },

    /**
     * Sets a function that supplies headers for every request made through
     * this resource. Replaces any previously installed getter.
     *
     * @param headerMethod - A function returning (possibly async) the headers
     *   to add to each request.
     * @returns This same resource, so calls can be chained.
     */
    setHeaders(
      headerMethod: () =>
        MaybePromise<Partial<Record<string, any>>> | undefined,
    ) {
      headers = headerMethod;

      return resource;
    },
  };

  return resource;
}

/**
 * Converts the library's `RequestOptions` into the subset of axios config
 * that per-call options may override.
 *
 * @param requestOptions - Per-call headers and/or an abort signal.
 * @returns An axios config fragment with only `headers`/`signal` set.
 */
function toAxiosOptions(requestOptions?: RequestOptions) {
  const result: Pick<AxiosRequestConfig, "headers" | "signal"> = {};

  if (requestOptions?.headers) {
    result.headers = requestOptions.headers;
  }

  if (requestOptions?.signal) {
    result.signal = requestOptions.signal;
  }

  return result;
}
