import { RawAxiosRequestHeaders, type AxiosRequestConfig } from "axios";

import type { ApiClient, ListResult, ResourceClient } from "client-api-types/client";
import type { RequestOptions, SuccessResponse } from "client-api-types";
import { ApiClientError } from "../errors/ApiClientError.js";
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

/**
 * How a resource reports outcomes. `"throw"` rejects with `ApiClientError`
 * on failure (the default - required by the TanStack Query hooks layer, which
 * only treats a rejected `queryFn` as an error); `"result"` never throws and
 * instead returns a typed {@link ResourceResult} union you can narrow with a
 * single `if (result.success)` check; `"query"` returns a
 * {@link QueryResult} shaped like a settled TanStack Query result
 * (`data`/`error`/`isError`/`isSuccess`/...), useful when the same code runs
 * server-side and client-side.
 *
 * @deprecated Renamed to {@link ResourceMode}. The `onError` option is kept
 * as an alias for `mode`.
 */
export type ResourceErrorMode = "throw" | "result" | "query";

/**
 * How a resource reports outcomes: `"throw"` (default), `"result"`, or
 * `"query"` - see {@link ResourceErrorMode} for the trade-offs.
 */
export type ResourceMode = ResourceErrorMode;

/**
 * The discriminated result every resource method resolves to when the
 * resource is created with `mode: "result"`. Narrow with `if (result.success)`:
 *
 * ```ts
 * const res = await users.list({ page: 1 });
 * if (!res.success) return res.error.message; // error: ApiClientError
 * res.data; // data: ListResult<User>
 * ```
 */
export type ResourceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiClientError };

/**
 * The result every resource method resolves to when the resource is created
 * with `mode: "query"`: a settled, TanStack Query-shaped object - the same
 * field names the hooks return (`data`, `error`, `isError`, `isSuccess`,
 * `isLoading`, ...), but type-safe: `status` is a strict discriminant and
 * the boolean flags are literal types, so the compiler knows `data` exists
 * exactly when `isSuccess`, and `error` exactly when `isError`.
 *
 * `isPending`/`isLoading`/`isFetching` are always `false`: after `await` the
 * call is settled - there is no in-flight state to model. They exist purely
 * for shape parity, so a component can swap a hook call for a plain resource
 * call without changing its field access.
 *
 * ```ts
 * const res = await users.getById("1"); // mode: "query"
 * if (res.isError) return res.error.code; // error: ApiClientError
 * res.data; // data: User
 * ```
 */
export type QueryResult<T> =
  | {
      status: "success";
      data: T;
      error: null;
      isPending: false;
      isSuccess: true;
      isError: false;
      isLoading: false;
      isFetching: false;
    }
  | {
      status: "error";
      data: undefined;
      error: ApiClientError;
      isPending: false;
      isSuccess: false;
      isError: true;
      isLoading: false;
      isFetching: false;
    };

/** The union of a plain payload and every non-throwing result envelope. */
export type AnyResult<T> = T | ResourceResult<T> | QueryResult<T>;

/**
 * Extracts the payload from any resource result - plain data, a
 * `ResourceResult`, or a `QueryResult` - and throws the `ApiClientError`
 * when the call failed. Used internally by the hooks layer and the prefetcher
 * so they work with any resource mode. Also handy for forwarding a resource
 * call through a helper that must produce a plain value.
 *
 * @param result - The resolved value of any resource method.
 * @returns The payload, or throws the failure's `ApiClientError`.
 *
 * @example
 * const res = await users.getById("1"); // any mode
 * const user = unwrapResourceResult(res); // User, or throws ApiClientError
 */
export function unwrapResourceResult<T>(result: AnyResult<T>): T {
  if (result !== null && typeof result === "object") {
    if ("success" in result) {
      if (result.success) return result.data;
      throw result.error;
    }
    if ("status" in result) {
      if (result.status === "error") throw result.error;
      return result.data;
    }
  }
  return result as T;
}

/**
 * Optional runtime validators applied to `response.data` before it's
 * returned, so the typed generics are backed by real checks at runtime (e.g.
 * zod schemas). A validator that throws (zod's `parse`) is normalized into
 * an `ApiClientError` with `kind: "unknown"` and the original error as its
 * cause - thrown or returned per the resource's mode.
 */
export type ResourceParsers<T> = {
  /** Validates list items before they're wrapped in `ListResult`. */
  list?: (data: unknown) => T[];
  /** Validates a single record fetched by id. */
  getById?: (data: unknown) => T;
  /** Validates the record returned by `create`. */
  create?: (data: unknown) => T;
  /** Validates the record returned by `update`. */
  update?: (data: unknown) => T;
};

/** Options accepted by `createResource`: the resource path plus any extra axios config. */
type CreateResourceOptions<Mode extends ResourceMode = "query", T = unknown> = AxiosRequestConfig & {
  /** Path relative to the client's baseURL, e.g. "/users". */
  baseURL: string;
  /**
   * How outcomes are reported. `"query"` (default) resolves a
   * {@link QueryResult} shaped like a settled TanStack Query result;
   * `"result"` returns a typed {@link ResourceResult} union instead of
   * throwing; `"throw"` rejects with `ApiClientError`. Whatever the mode,
   * the hooks layer (`createResourceHooks`) and the prefetcher work with the
   * resource unchanged. Switch modes at runtime via `setMode`.
   */
  mode?: Mode;
  /**
   * Alias for `mode`, kept for backwards compatibility. When both are given,
   * `mode` wins.
   */
  onError?: Mode;
  /** Optional runtime validators (e.g. zod schemas) for response payloads. */
  parse?: ResourceParsers<T>;
};

/** The resource contract when `mode: "result"` - every method returns a {@link ResourceResult} instead of throwing. */
export interface SafeResourceClient<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
> {
  list(params?: ListParams, options?: RequestOptions): Promise<ResourceResult<ListResult<T>>>;
  getById(id: string | number, options?: RequestOptions): Promise<ResourceResult<T>>;
  create(input: CreateInput, options?: RequestOptions): Promise<ResourceResult<T>>;
  update(id: string | number, input: UpdateInput, options?: RequestOptions): Promise<ResourceResult<T>>;
  remove(id: string | number, options?: RequestOptions): Promise<ResourceResult<null>>;
  custom<R = unknown>(
    method?: "GET" | "POST" | "PUT" | "DELETE",
    path?: string,
    options?: {
      data?: any;
      params?: Record<string, any>;
      options?: RequestOptions;
      /** Per-call runtime validator for this request's payload. */
      parse?: (data: unknown) => R;
    },
  ): Promise<ResourceResult<R>>;
  setConfig(
    newConfig:
      | Partial<AxiosRequestConfig>
      | ((currentConfig: AxiosRequestConfig) => Promise<Partial<AxiosRequestConfig>>),
  ): Promise<SafeResourceClient<T, ListParams, CreateInput, UpdateInput>>;
  setClient(newClient: ApiClient): SafeResourceClient<T, ListParams, CreateInput, UpdateInput>;
  setHeaders(
    headerMethod: () => MaybePromise<Partial<Record<string, any>>> | undefined,
  ): SafeResourceClient<T, ListParams, CreateInput, UpdateInput>;
  /**
   * Switches the resource's mode at runtime, like `setHeaders`. The switch is
   * global to the resource (any handle created from it sees the new mode).
   * Returns the same resource typed for the new mode, so callers get the
   * precise contract: `users.setMode("result")` is a `SafeResourceClient`.
   */
  setMode<M extends ResourceMode>(mode: M): ResourceClientByMode<M, T, ListParams, CreateInput, UpdateInput>;
}

/** The resource contract when `mode: "query"` - every method resolves a settled, TanStack Query-shaped {@link QueryResult} instead of throwing. */
export interface QueryResourceClient<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
> {
  list(params?: ListParams, options?: RequestOptions): Promise<QueryResult<ListResult<T>>>;
  getById(id: string | number, options?: RequestOptions): Promise<QueryResult<T>>;
  create(input: CreateInput, options?: RequestOptions): Promise<QueryResult<T>>;
  update(id: string | number, input: UpdateInput, options?: RequestOptions): Promise<QueryResult<T>>;
  remove(id: string | number, options?: RequestOptions): Promise<QueryResult<null>>;
  custom<R = unknown>(
    method?: "GET" | "POST" | "PUT" | "DELETE",
    path?: string,
    options?: {
      data?: any;
      params?: Record<string, any>;
      options?: RequestOptions;
      /** Per-call runtime validator for this request's payload. */
      parse?: (data: unknown) => R;
    },
  ): Promise<QueryResult<R>>;
  setConfig(
    newConfig:
      | Partial<AxiosRequestConfig>
      | ((currentConfig: AxiosRequestConfig) => Promise<Partial<AxiosRequestConfig>>),
  ): Promise<QueryResourceClient<T, ListParams, CreateInput, UpdateInput>>;
  setClient(newClient: ApiClient): QueryResourceClient<T, ListParams, CreateInput, UpdateInput>;
  setHeaders(
    headerMethod: () => MaybePromise<Partial<Record<string, any>>> | undefined,
  ): QueryResourceClient<T, ListParams, CreateInput, UpdateInput>;
  /**
   * Switches the resource's mode at runtime, like `setHeaders`. The switch is
   * global to the resource (any handle created from it sees the new mode).
   * Returns the same resource typed for the new mode, so callers get the
   * precise contract: `users.setMode("result")` is a `SafeResourceClient`.
   */
  setMode<M extends ResourceMode>(mode: M): ResourceClientByMode<M, T, ListParams, CreateInput, UpdateInput>;
}

/** The resource contract when `mode: "throw"` - every method rejects with `ApiClientError` on failure. */
export interface ThrowResourceClient<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
> extends ResourceClient<T, CreateInput, UpdateInput, ListParams> {
  /**
   * Switches the resource's mode at runtime, like `setHeaders`. The switch is
   * global to the resource (any handle created from it sees the new mode).
   * Returns the same resource typed for the new mode, so callers get the
   * precise contract: `users.setMode("result")` is a `SafeResourceClient`.
   */
  setMode<M extends ResourceMode>(mode: M): ResourceClientByMode<M, T, ListParams, CreateInput, UpdateInput>;
}

/** Picks the resource contract based on the `mode` option. */
type ResourceClientByMode<
  Mode extends ResourceMode,
  T,
  ListParams extends object,
  CreateInput,
  UpdateInput,
> = Mode extends "result"
  ? SafeResourceClient<T, ListParams, CreateInput, UpdateInput>
  : Mode extends "query"
    ? QueryResourceClient<T, ListParams, CreateInput, UpdateInput>
    : ThrowResourceClient<T, ListParams, CreateInput, UpdateInput>;

/**
 * Any of the three mode-specific resource contracts. Accepted by
 * `createResourceHooks` and `createResourcePrefetcher`, which are
 * mode-agnostic: they extract the payload (or throw the `ApiClientError`)
 * from whatever mode the resource is in via {@link unwrapResourceResult}.
 */
export type AnyResourceClient<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
> =
  | ThrowResourceClient<T, ListParams, CreateInput, UpdateInput>
  | SafeResourceClient<T, ListParams, CreateInput, UpdateInput>
  | QueryResourceClient<T, ListParams, CreateInput, UpdateInput>;

/** Loose internal shape both contracts share - narrowed to the mode's contract on return. */
type AnyResource = {
  list: (params?: any, requestOptions?: RequestOptions) => Promise<any>;
  getById: (id: string | number, requestOptions?: RequestOptions) => Promise<any>;
  create: (input: any, requestOptions?: RequestOptions) => Promise<any>;
  update: (id: string | number, input: any, requestOptions?: RequestOptions) => Promise<any>;
  remove: (id: string | number, requestOptions?: RequestOptions) => Promise<any>;
  custom: (method?: any, path?: any, options?: any) => Promise<any>;
  setConfig: (newConfig: any) => Promise<any>;
  setClient: (newClient: ApiClient) => any;
  setHeaders: (headerMethod: any) => any;
  setMode: (mode: any) => any;
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
 *   axios request config to apply to every request (e.g. `params`, `headers`),
 *   a `mode` option, and optional `parse` validators.
 * @returns A {@link QueryResourceClient} (or {@link SafeResourceClient} /
 *   {@link ThrowResourceClient} when `mode` is `"result"` / `"throw"`) with
 *   `list`, `getById`, `create`, `update`, `remove`, `custom`, runtime
 *   configuration setters, and `setMode` for switching modes on the fly.
 *
 * The return contract is chosen by overloading on the `mode` option:
 * `"query"` (the default) returns a {@link QueryResourceClient} whose methods
 * resolve a settled {@link QueryResult} shaped like a TanStack Query result;
 * `"result"` returns a {@link SafeResourceClient} whose methods resolve a
 * typed {@link ResourceResult} instead of throwing; `"throw"` returns a
 * {@link ThrowResourceClient} that rejects with `ApiClientError`.
 *
 * @example
 * const users = createResource<User, OffsetPaginationParams, CreateUserInput, UpdateUserInput>(
 *   apiClient,
 *   { baseURL: "/users" },
 * ); // mode defaults to "query"
 * const page = await users.list({ page: 1, limit: 20 }); // QueryResult<ListResult<User>>
 *
 * @example
 * // Typed success/error results for server actions - no try/catch needed:
 * const users = createResource<User>(apiClient, { baseURL: "/users", mode: "result" });
 * const res = await users.getById("1");
 * if (!res.success) return res.error.message; // error is ApiClientError
 * res.data; // data is User
 *
 * @example
 * // Switch modes at runtime - every handle sees the new mode:
 * const users = createResource<User>(apiClient, { baseURL: "/users" }); // "query"
 * const safe = users.setMode("result");
 * const res = await safe.getById("1"); // { success: true, data } | { success: false, error }
 */
export function createResource<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
>(
  client: ApiClient,
  options: CreateResourceOptions<"query", T>,
): QueryResourceClient<T, ListParams, CreateInput, UpdateInput>;
export function createResource<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
>(
  client: ApiClient,
  options: CreateResourceOptions<"result", T>,
): SafeResourceClient<T, ListParams, CreateInput, UpdateInput>;
export function createResource<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
>(
  client: ApiClient,
  options: CreateResourceOptions<"throw", T>,
): ThrowResourceClient<T, ListParams, CreateInput, UpdateInput>;
export function createResource<
  T,
  ListParams extends object = Record<string, unknown>,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
  Mode extends ResourceMode = "query",
>(
  client: ApiClient,
  options: CreateResourceOptions<Mode, T>,
): ResourceClientByMode<Mode, T, ListParams, CreateInput, UpdateInput> {
  const { baseURL: basePath, mode, onError, parse, ...initialConfig } = options;
  /** Effective mode: `mode` wins over the deprecated `onError` alias when both are given; defaults to `"query"`. */
  let errorMode = mode ?? onError ?? "query";
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

  /**
   * Runs an operation and reports outcomes per the resource's mode:
   * `"throw"` rethrows, `"result"` returns a typed {@link ResourceResult},
   * `"query"` returns a settled, TanStack Query-shaped {@link QueryResult}.
   *
   * @param exec - The operation to run (request + validation).
   * @returns The operation's value, or a result object when in a result mode.
   */
  async function settle<R>(exec: () => Promise<R>): Promise<R | ResourceResult<R> | QueryResult<R>> {
    if (errorMode === "throw") return exec();
    try {
      const data = await exec();
      if (errorMode === "result") {
        return { success: true as const, data };
      }
      return {
        status: "success" as const,
        data,
        error: null,
        isPending: false,
        isSuccess: true,
        isError: false,
        isLoading: false,
        isFetching: false,
      };
    } catch (cause) {
      const error = ApiClientError.unknown(cause);
      if (errorMode === "result") {
        return { success: false as const, error };
      }
      return {
        status: "error" as const,
        data: undefined,
        error,
        isPending: false,
        isSuccess: false,
        isError: true,
        isLoading: false,
        isFetching: false,
      };
    }
  }

  /**
   * Applies an optional runtime validator to a payload. Validator failures
   * (e.g. a throwing zod `parse`) are normalized into an `ApiClientError`
   * with `kind: "unknown"` and the original error as its cause.
   *
   * @param parser - The validator to run, if any.
   * @param data - The raw payload from the server.
   * @returns The validated payload.
   */
  function validate<Out>(parser: ((data: unknown) => Out) | undefined, data: unknown): Out {
    if (!parser) return data as Out;
    try {
      return parser(data);
    } catch (cause) {
      throw ApiClientError.unknown(cause);
    }
  }

  const resource: AnyResource = {
    /**
     * Fetches a paginated list of records.
     *
     * @param params - Query params (page/limit, cursor, filters, ...).
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The list items plus their pagination metadata.
     */
    async list(params, requestOptions) {
      return settle(async () => {
        const response = await execute<T[]>({
          method: "GET",
          url: basePath,
          params,
          ...toAxiosOptions(requestOptions),
        });

        return {
          items: validate(parse?.list, response.data),
          pagination: response.pagination ?? EMPTY_OFFSET_PAGINATION,
        };
      });
    },

    /**
     * Fetches a single record by id.
     *
     * @param id - The record's id. Falsy ids (undefined/null/empty) request
     *   the base path itself rather than a malformed URL.
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The record.
     */
    async getById(id, requestOptions) {
      return settle(async () => {
        const response = await execute<T>({
          method: "GET",
          url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
          ...toAxiosOptions(requestOptions),
        });

        return validate(parse?.getById, response.data);
      });
    },

    /**
     * Creates a record with a POST to the base path.
     *
     * @param input - The creation payload.
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The created record as returned by the server.
     */
    async create(input, requestOptions) {
      return settle(async () => {
        const response = await execute<T>({
          method: "POST",
          url: basePath,
          data: input,
          ...toAxiosOptions(requestOptions),
        });

        return validate(parse?.create, response.data);
      });
    },

    /**
     * Partially updates a record with a PATCH to `/basePath/:id`.
     *
     * @param id - The record's id.
     * @param input - The update payload (merged server-side).
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns The updated record as returned by the server.
     */
    async update(id, input, requestOptions) {
      return settle(async () => {
        const response = await execute<T>({
          method: "PATCH",
          url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
          data: input,
          ...toAxiosOptions(requestOptions),
        });

        return validate(parse?.update, response.data);
      });
    },

    /**
     * Deletes a record with a DELETE to `/basePath/:id`.
     *
     * @param id - The record's id.
     * @param requestOptions - Per-call headers and/or an abort signal.
     * @returns Resolves once the server confirms deletion.
     */
    async remove(id, requestOptions) {
      return settle(async () => {
        await execute({
          method: "DELETE",
          url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
          ...toAxiosOptions(requestOptions),
        });

        return null;
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
     * @param options - Request body, query params, per-call headers/signal,
     *   and an optional per-call runtime validator for the payload.
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
        /** Per-call runtime validator for this request's payload. */
        parse?: (data: unknown) => R;
      },
    ) {
      const { data, params, options: requestOptions, parse: parseCustom } = options ?? {};

      return settle(async () => {
        const response = await execute<R>({
          method,
          url: `${basePath}${safeNormalizeUrl(path)}`,
          data,
          params,
          ...toAxiosOptions(requestOptions),
        });

        return validate(parseCustom, response.data);
      });
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

    /**
     * Switches the resource's mode at runtime (`"query"` | `"result"` |
     * `"throw"`), like `setHeaders`. The switch is global to the resource -
     * any handle created from it (including ones captured earlier) sees the
     * new mode. Returns the same resource typed for the new mode, so the
     * call site gets the precise contract.
     *
     * @param mode - The mode to switch to.
     * @returns This same resource, typed for the new mode, so calls can be chained.
     */
    setMode<M extends ResourceMode>(mode: M) {
      errorMode = mode;

      return resource as ResourceClientByMode<M, T, ListParams, CreateInput, UpdateInput>;
    },
  };

  return resource as ResourceClientByMode<Mode, T, ListParams, CreateInput, UpdateInput>;
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