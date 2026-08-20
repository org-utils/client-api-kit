import axios, { type AxiosError } from "axios";
import type { ApiClientErrorOptions, ErrorDetail, ErrorResponse, ApiClientErrorKind as APIclienterrorKind } from "client-api-types";

/** The failure categories a request can normalize to: `http`, `network`, `timeout`, `cancelled`, or `unknown`. */
export type ApiClientErrorKind = APIclienterrorKind;

/**
 * The single error type every request made through this package's client
 * can throw or reject with - React Query's `error` field, a caught
 * exception in a server action, all the same shape. Check `.kind` to branch
 * on network vs. timeout vs. an actual server-returned error, and `.code`/
 * `.statusCode` to branch on *which* error the server returned.
 */
export class ApiClientError extends Error {
  /** Which failure category this error belongs to (`http`, `network`, `timeout`, `cancelled`, `unknown`). */
  readonly kind: ApiClientErrorKind;
  /** HTTP status code, present when the server responded (`kind === "http"`). */
  readonly statusCode?: number;
  /** Machine-readable error code from the server (e.g. `"VALIDATION_ERROR"`, `"NOT_FOUND"`), or a fallback like `"NETWORK_ERROR"`. */
  readonly code?: string;
  /** Field-level error details from the server, when it sent any. */
  readonly details?: ErrorDetail[];

  /**
   * @param options - `{ kind, message, statusCode?, code?, details?, cause? }`.
   *   The original axios error (or other cause) is attached via the native
   *   `cause` mechanism.
   */
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

  /**
   * Normalizes a raw axios error into an {@link ApiClientError}:
   * cancellations, timeouts, network failures, and server-returned
   * `ErrorResponse` bodies each map to their `kind`/`code`.
   *
   * @param error - The raw axios error.
   * @returns The normalized `ApiClientError`.
   */
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

  /**
   * Builds an `ApiClientError` from a server-returned `ErrorResponse` envelope
   * (used when a 2xx status arrives with `success: false`, a contract violation).
   *
   * @param response - The error envelope from the server.
   * @param cause - Optional underlying cause to attach.
   * @returns The normalized `ApiClientError`.
   */
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

  /**
   * Wraps an unexpected, non-axios error into an `ApiClientError` with
   * `kind: "unknown"`. Passes existing `ApiClientError`s through unchanged.
   *
   * @param cause - The unexpected error (or any value).
   * @returns An `ApiClientError` with `kind: "unknown"`.
   */
  static unknown(cause: unknown): ApiClientError {
    if (cause instanceof ApiClientError) return cause;
    const message = cause instanceof Error ? cause.message : "An unexpected client error occurred";
    return new ApiClientError({ kind: "unknown", message, cause });
  }
}

/**
 * Type guard for the error envelope shape: an object with `success: false`
 * and an `error` field carrying `code`/`message`/`details`.
 *
 * @param data - The raw response body.
 * @returns `true` when `data` looks like an `ErrorResponse`.
 */
function isErrorResponseShape(data: unknown): data is ErrorResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    (data as { success: unknown }).success === false &&
    "error" in data
  );
}