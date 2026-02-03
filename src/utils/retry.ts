/**
 * Retry utility for handling transient failures
 * Implements exponential backoff with configurable options
 */

import { logger } from './logger.js';

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay between retries in milliseconds (default: 1000) */
  delayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay between retries in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Whether to add jitter to delay (default: true) */
  jitter?: boolean;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean;
  /** Callback called before each retry */
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Default options for retry
 */
const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  jitter: true,
  isRetryable: () => true,
  onRetry: () => {},
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with optional jitter
 */
function calculateDelay(
  baseDelay: number,
  attempt: number,
  multiplier: number,
  maxDelay: number,
  jitter: boolean
): number {
  // Exponential backoff
  let delay = baseDelay * Math.pow(multiplier, attempt - 1);

  // Apply max delay cap
  delay = Math.min(delay, maxDelay);

  // Add jitter (±25%)
  if (jitter) {
    const jitterAmount = delay * 0.25;
    delay = delay - jitterAmount + Math.random() * jitterAmount * 2;
  }

  return Math.floor(delay);
}

/**
 * Execute an operation with automatic retry on failure
 *
 * @param operation - The async operation to execute
 * @param context - A description of the operation for logging
 * @param options - Retry configuration options
 * @returns The result of the successful operation
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchExternalApi('/data'),
 *   'fetch external data',
 *   { maxAttempts: 5, delayMs: 2000 }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { maxAttempts, delayMs, backoffMultiplier, maxDelayMs, jitter, isRetryable, onRetry } = opts;

  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (!isRetryable(lastError)) {
        logger.warn(
          {
            context,
            attempt,
            maxAttempts,
            error: lastError.message,
            retryable: false,
          },
          `Non-retryable error encountered`
        );
        throw lastError;
      }

      logger.warn(
        {
          context,
          attempt,
          maxAttempts,
          error: lastError.message,
        },
        `Attempt ${attempt} failed`
      );

      // Call retry callback
      onRetry(lastError, attempt);

      // If not the last attempt, wait before retrying
      if (attempt < maxAttempts) {
        const delay = calculateDelay(delayMs, attempt, backoffMultiplier, maxDelayMs, jitter);
        logger.debug({ context, delay, nextAttempt: attempt + 1 }, 'Waiting before retry');
        await sleep(delay);
      }
    }
  }

  logger.error(
    {
      context,
      error: lastError.message,
      totalAttempts: maxAttempts,
    },
    'All retry attempts failed'
  );

  throw new Error(`${context} failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Create a retryable version of an async function
 *
 * @param fn - The async function to wrap
 * @param context - A description for logging
 * @param options - Retry configuration options
 * @returns A wrapped function that automatically retries on failure
 *
 * @example
 * ```typescript
 * const retryableFetch = createRetryable(
 *   (url: string) => fetch(url),
 *   'HTTP fetch'
 * );
 * const response = await retryableFetch('https://api.example.com/data');
 * ```
 */
export function createRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  context: string,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), context, options);
}

/**
 * Common retryable error predicates
 */
export const RetryPredicates = {
  /**
   * Retry on network errors (ECONNREFUSED, ETIMEDOUT, etc.)
   */
  networkErrors: (error: Error): boolean => {
    const networkErrorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE'];
    return networkErrorCodes.some((code) => error.message.includes(code));
  },

  /**
   * Retry on HTTP 5xx errors
   */
  serverErrors: (error: Error): boolean => {
    return /\b5\d{2}\b/.test(error.message) || error.message.includes('Internal Server Error');
  },

  /**
   * Retry on HTTP 429 (rate limit) errors
   */
  rateLimitErrors: (error: Error): boolean => {
    return error.message.includes('429') || error.message.toLowerCase().includes('rate limit');
  },

  /**
   * Combine multiple predicates with OR logic
   */
  any:
    (...predicates: ((error: Error) => boolean)[]): ((error: Error) => boolean) =>
    (error: Error) =>
      predicates.some((predicate) => predicate(error)),

  /**
   * Combine multiple predicates with AND logic
   */
  all:
    (...predicates: ((error: Error) => boolean)[]): ((error: Error) => boolean) =>
    (error: Error) =>
      predicates.every((predicate) => predicate(error)),
};

/**
 * Default retryable error predicate for external API calls
 */
export const defaultApiRetryPredicate = RetryPredicates.any(
  RetryPredicates.networkErrors,
  RetryPredicates.serverErrors,
  RetryPredicates.rateLimitErrors
);
