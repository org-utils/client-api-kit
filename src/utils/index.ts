import { CursorPaginationMeta, OffsetPaginationMeta, PaginationMeta } from "client-api-types";

/** Narrowing helpers so consumers don't need to hand-roll `"type" in meta` checks. */
export function isOffsetPagination(meta: PaginationMeta): meta is OffsetPaginationMeta {
  return meta.type === "offset";
}

export function isCursorPagination(meta: PaginationMeta): meta is CursorPaginationMeta {
  return meta.type === "cursor";
}
