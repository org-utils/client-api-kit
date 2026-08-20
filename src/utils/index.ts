import { CursorPaginationMeta, OffsetPaginationMeta, PaginationMeta } from "client-api-types";
import type { AxiosRequestConfig } from "axios";

/** Narrowing helpers so consumers don't need to hand-roll `"type" in meta` checks. */
export function isOffsetPagination(meta: PaginationMeta): meta is OffsetPaginationMeta {
  return meta.type === "offset";
}

export function isCursorPagination(meta: PaginationMeta): meta is CursorPaginationMeta {
  return meta.type === "cursor";
}

/** Converts a WHATWG `Headers` instance (e.g. from a fetch request) into a plain object axios can use. */
export function normalizeHeaders(
  headers?: AxiosRequestConfig["headers"],
): AxiosRequestConfig["headers"] {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return headers;
}

/** True for any value that isn't null, undefined, an empty/whitespace string, an empty array, or an empty object. */
export function isDefined(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string" && value.trim() === "") {
    return false;
  }

  if (Array.isArray(value) && value.length === 0) {
    return false;
  }

  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    return false;
  }

  return true;
}

/**
 * Normalize a URL/path: absolute URLs (with protocol) pass through unchanged;
 * path-only inputs get single slashes and a leading "/". Empty input returns "".
 */
export function normalizeUrl(url: string | number | null | undefined): string {
  if (!url || (typeof url === "string" && url.trim() === "")) {
    return "";
  }

  let normalized = typeof url === "number" ? String(url) : url.trim();

  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized);
  if (hasProtocol) {
    return normalized;
  }

  normalized = normalized.replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }
  return normalized;
}

/** Safe version of `normalizeUrl` with a fallback for unexpected inputs. */
export function safeNormalizeUrl(
  url: string | number | null | undefined,
  fallback: string = "",
): string {
  try {
    return normalizeUrl(url) || fallback;
  } catch {
    return fallback;
  }
}