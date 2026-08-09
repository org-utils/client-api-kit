import type { AxiosError } from "axios";
import type { RetryConfig } from "client-api-types";

const DEFAULTS: Required<RetryConfig> = {
  retries: 2,
  retryDelayMs: 300,
  retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
  retryMethods: ["get", "head", "options", "delete"],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: AxiosError, config: Required<RetryConfig>): boolean {
  // Network errors (no response at all) are always worth retrying - they're
  // usually transient (DNS blip, connection reset).
  if (!error.response) return error.code !== "ERR_CANCELED";
  return config.retryOnStatusCodes.includes(error.response.status);
}

/**
 * Retries `fn` with exponential backoff (capped at 5s) when the error is
 * transient and the request method is idempotent. Non-idempotent methods
 * (POST, PATCH by default) are never retried automatically, since retrying
 * a partially-applied mutation can duplicate side effects.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  method: string,
  userConfig: RetryConfig | false | undefined,
): Promise<T> {
  if (userConfig === false) return fn();
  const config: Required<RetryConfig> = { ...DEFAULTS, ...userConfig };

  if (!config.retryMethods.includes(method.toLowerCase())) {
    return fn();
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const axiosError = error as AxiosError;
      const isLastAttempt = attempt === config.retries;
      if (isLastAttempt || !axiosError.isAxiosError || !isRetryableError(axiosError, config)) {
        throw error;
      }
      const delay = Math.min(config.retryDelayMs * 2 ** attempt, 5000);
      await sleep(delay);
    }
  }
  // Unreachable, but keeps TypeScript happy about the return path.
  throw lastError;
}
