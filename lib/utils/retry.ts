/**
 * Retry Utilities
 *
 * Provides retry logic with exponential backoff for transient failures.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Backoff multiplier */
  backoffFactor?: number;
  /** Optional function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each retry */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry" | "isRetryable">> = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffFactor: 2,
};

/**
 * Default function to determine if an error is retryable
 */
function defaultIsRetryable(error: unknown): boolean {
  // Retry on network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // MongoDB transient errors
    if (
      message.includes("timed out") ||
      message.includes("connection") ||
      message.includes("network") ||
      message.includes("socket") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout")
    ) {
      return true;
    }

    // MongoDB specific transient errors
    if (
      message.includes("topology was destroyed") ||
      message.includes("server selection") ||
      message.includes("not primary") ||
      message.includes("node is recovering")
    ) {
      return true;
    }
  }

  // Check for MongoDB error codes
  if (error && typeof error === "object" && "code" in error) {
    const mongoError = error as { code: number };
    // Transient transaction errors, network errors
    const retryableCodes = [
      6, // HostUnreachable
      7, // HostNotFound
      89, // NetworkTimeout
      91, // ShutdownInProgress
      189, // PrimarySteppedDown
      262, // ExceededTimeLimit
      9001, // SocketException
      10107, // NotPrimary
      11600, // InterruptedAtShutdown
      11602, // InterruptedDueToReplStateChange
      13436, // NotPrimaryOrSecondary
    ];

    if (retryableCodes.includes(mongoError.code)) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffFactor: number
): number {
  const delay = Math.min(initialDelay * Math.pow(backoffFactor, attempt), maxDelay);
  // Add jitter (0.5 to 1.5 of calculated delay)
  const jitter = 0.5 + Math.random();
  return Math.floor(delay * jitter);
}

/**
 * Execute a function with retry logic
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the function
 * @throws Last error after all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries,
    initialDelay,
    maxDelay,
    backoffFactor,
  } = { ...DEFAULT_OPTIONS, ...options };

  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const onRetry = options.onRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!isRetryable(error)) {
        break;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, initialDelay, maxDelay, backoffFactor);

      // Call retry callback
      onRetry?.(error, attempt + 1, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Wrapper for database operations with retry
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, "isRetryable"> = {}
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 3000,
    backoffFactor: 2,
    ...options,
    isRetryable: defaultIsRetryable,
  });
}

export default withRetry;
