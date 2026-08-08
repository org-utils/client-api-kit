import axios, { type AxiosError } from "axios";
import type { ErrorDetail, ErrorResponse } from "api-response-tsjs";

export type ApiClientErrorKind = "network" | "timeout" | "cancelled" | "http" | "unknown";

export interface ApiClientErrorOptions {
  kind: ApiClientErrorKind;
  message: string;
  statusCode?: number;
  /** Machine-readable code from the server's ErrorResponse (see api-response-tsjs's ErrorCode), or a local one like "NETWORK_ERROR". */
  code?: string;
  details?: ErrorDetail[];
  cause?: unknown;
}

/**
 * The single error type every request made through this package's client
 * can throw or reject with - React Query's `error` field, a caught
 * exception in a server action, all the same shape. Check `.kind` to branch
 * on network vs. timeout vs. an actual server-returned error, and `.code`/
 * `.statusCode` to branch on *which* error the server returned.
 */
export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  readonly statusCode?: number;
  readonly code?: string;
  readonly details?: ErrorDetail[];

  constructor(options: ApiClientErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ApiClientError";
    this.kind = options.kind;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.code !== undefined) this.code = options.code;
    if (options.details !== undefined) this.details = options.details;
    Error.captureStackTrace?.(this, ApiClientError);
  }

  /** True for errors worth showing directly to the user (validation, not found, conflict, ...) as opposed to unexpected infrastructure failures. */
  get isOperational(): boolean {
    return this.kind === "http" && this.statusCode !== undefined && this.statusCode < 500;
  }

  static fromAxiosError(error: AxiosError): ApiClientError {
    if (axios.isCancel(error) || error.code === "ERR_CANCELED") {
      return new ApiClientError({ kind: "cancelled", message: "Request was cancelled", cause: error });
    }

    if (error.code === "ECONNABORTED" || /timeout/i.test(error.message)) {
      return new ApiClientError({ kind: "timeout", message: "Request timed out", code: "TIMEOUT", cause: error });
    }

    if (!error.response) {
      return new ApiClientError({
        kind: "network",
        message: error.message || "Network error - the server could not be reached",
        code: "NETWORK_ERROR",
        cause: error,
      });
    }

    const { status, data } = error.response;
    if (isErrorResponseShape(data)) {
      return new ApiClientError({
        kind: "http",
        statusCode: status,
        code: data.error.code,
        message: data.error.message,
        ...(data.error.details ? { details: data.error.details } : {}),
        cause: error,
      });
    }

    return new ApiClientError({
      kind: "http",
      statusCode: status,
      code: "HTTP_ERROR",
      message: typeof data === "string" && data.length > 0 ? data : error.message,
      cause: error,
    });
  }

  static fromErrorResponse(response: ErrorResponse, cause?: unknown): ApiClientError {
    return new ApiClientError({
      kind: "http",
      statusCode: response.statusCode,
      code: response.error.code,
      message: response.error.message,
      ...(response.error.details ? { details: response.error.details } : {}),
      ...(cause !== undefined ? { cause } : {}),
    });
  }

  static unknown(cause: unknown): ApiClientError {
    if (cause instanceof ApiClientError) return cause;
    const message = cause instanceof Error ? cause.message : "An unexpected client error occurred";
    return new ApiClientError({ kind: "unknown", message, cause });
  }
}

function isErrorResponseShape(data: unknown): data is ErrorResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    (data as { success: unknown }).success === false &&
    "error" in data
  );
}
