import { RawAxiosRequestHeaders, type AxiosRequestConfig } from "axios";

import type { ApiClient } from "../core/create-client.js";
import type { RequestOptions } from "../types/client.js";
import type { ListResult, ResourceClient } from "../types/resource.js";
import { SuccessResponse } from "api-response-tsjs";
import { isDefined, safeNormalizeUrl } from "./utils.js";
type ApiResponse<T> = SuccessResponse<T>;

const EMPTY_OFFSET_PAGINATION = {
  type: "offset" as const,
  page: 1,
  limit: 0,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

type ResourceConfig = Omit<AxiosRequestConfig, "baseURL">;

type CreateResourceOptions = AxiosRequestConfig & {
  baseURL: string;
};

type MaybePromise<T> = T | Promise<T>;

export function createResource<
  T,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
  ListParams extends object = Record<string, unknown>,
>(
  client: ApiClient,
  options: CreateResourceOptions,
): ResourceClient<T, CreateInput, UpdateInput, ListParams> {
  const { baseURL: basePath, ...initialConfig } = options;
  let rClient = client;
  let config: ResourceConfig = {
    ...initialConfig,
  };
  let headers: (
    // current: Readonly<Record<string, any>>,
  ) => MaybePromise<Partial<Record<string, any>>> | undefined;

  function normalizeHeaders(
    headers?: AxiosRequestConfig["headers"],
  ): AxiosRequestConfig["headers"] {
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }

    return headers;
  }
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

  async function execute<R>(
    request: AxiosRequestConfig,
  ): Promise<ApiResponse<R>> {
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

    async getById(id, requestOptions): Promise<T> {
      const response = await execute<T>({
        method: "GET",
        url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

    async create(input, requestOptions): Promise<T> {
      const response = await execute<T>({
        method: "POST",
        url: basePath,
        data: input,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

    async update(id, input, requestOptions): Promise<T> {
      const response = await execute<T>({
        method: "PATCH",
        url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
        data: input,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

    async remove(id, requestOptions): Promise<void> {
      await execute({
        method: "DELETE",
        url: `${basePath}${isDefined(id) ? `/${encodeURIComponent(String(id))}` : ""}`,
        ...toAxiosOptions(requestOptions),
      });
    },

    async custom<R = unknown>(
      method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
      path?: string,
      options?: {
        data?: any;
        params?: Record<string, any>;
        requestOptions?: RequestOptions;
      },
    ): Promise<R> {
      const { data, params, requestOptions } = options ?? {};

      const response = await execute<R>({
        method,
        url: `${basePath}${safeNormalizeUrl(path)}`,
        data,
        params,
        ...toAxiosOptions(requestOptions),
      });

      return response.data;
    },

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
    setClient(newClient: ApiClient) {
      rClient = newClient;

      return resource;
    },
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
