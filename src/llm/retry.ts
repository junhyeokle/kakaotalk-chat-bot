function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

/** HTTP statuses worth retrying: rate-limited or transiently unavailable. */
export function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || status === 500 || status === 503;
}

/**
 * Retries `fn` with exponential backoff (baseDelayMs, 2x, 4x, ...) when
 * `isRetryable` says the error is transient (e.g. a 429 rate-limit
 * response). Gives up and rethrows on the last attempt, or immediately for
 * a non-retryable error — callers (messageHandler's fire-and-forget catch)
 * treat a thrown error as "this message goes unanswered", so this only
 * exists to avoid giving up on a merely temporary rate limit.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  options: RetryOptions,
): Promise<T> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === options.maxAttempts || !isRetryable(err)) throw err;
      await sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error('withRetry: exhausted attempts without a result');
}
