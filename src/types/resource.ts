import type { PaginationMeta } from "api-response-tsjs";
import type { RequestOptions } from "./client.js";
import { AxiosRequestConfig } from "axios";
import { ApiClient } from "../core/create-client.js";

export interface ListResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

type MaybePromise<T> = T | Promise<T>;
export interface CreateResourceOptions {
  /** Path relative to the client's baseURL, e.g. "/users". No trailing slash. */
  basePath: string;
}

/**
 * The generic contract a `createResource(...)` call fulfills. `ListParams`
 * is typically `OffsetPaginationParams` or `CursorPaginationParams` from
 * `api-response-tsjs`, optionally intersected with your own filter/sort
 * fields (e.g. `{ status?: "active" | "archived" }`).
 */
export interface ResourceClient<
  T,
  CreateInput = Partial<T>,
  UpdateInput = Partial<T>,
  ListParams extends object = Record<string, unknown>,
> {
  list(params?: ListParams, options?: RequestOptions): Promise<ListResult<T>>;
  getById(id: string | number, options?: RequestOptions): Promise<T>;
  create(input: CreateInput, options?: RequestOptions): Promise<T>;
  update(id: string | number, input: UpdateInput, options?: RequestOptions): Promise<T>;
  remove(id: string | number, options?: RequestOptions): Promise<void>;
  custom<R = unknown>(method?: "GET" | "POST" | "PUT" | "DELETE", path?: string, options?: { data?: any; params?: Record<string, any>; options?: RequestOptions}): Promise<R>;
  setConfig: (newConfig: Partial<AxiosRequestConfig> | ((currentConfig: AxiosRequestConfig) => Promise<Partial<AxiosRequestConfig>>)) =>
    Promise<ResourceClient<T, CreateInput, UpdateInput, ListParams>>
  setClient: (newClient: ApiClient) => ResourceClient<T, CreateInput, UpdateInput, ListParams>;
  setHeaders: (headerMethod: () => MaybePromise<Partial<Record<string, any>>>  | undefined) => ResourceClient<T, CreateInput, UpdateInput, ListParams>;
}
