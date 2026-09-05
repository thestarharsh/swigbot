import { sleep as realSleep } from "./util/sleep";

/**
 * One retry loop for both the MCP and the LLM edge. The two differed only in
 * their constants and in what counts as retryable, and drifting apart meant
 * two places to fix a backoff bug. `withRetry` and `withLlmRetry` are the
 * public entry points; nothing else should call this directly.
 */
export interface BackoffPolicy {
  maxAttempts: number;
  wallClockMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
  isRetryable(err: unknown): boolean;
  /** Provider wait hint (Retry-After); overrides the computed delay. */
  retryAfterMs?(err: unknown): number | undefined;
  onRetry?(err: unknown, attempt: number, delayMs: number): void;
  /** Injected by tests so a suite does not spend the real backoff budget. */
  sleep?(ms: number): Promise<void>;
}

export async function backoff<T>(fn: () => Promise<T>, policy: BackoffPolicy): Promise<T> {
  const wait = policy.sleep ?? realSleep;
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= policy.maxAttempts || !policy.isRetryable(err)) throw err;
      const base = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
      const delay = policy.retryAfterMs?.(err) ?? base + Math.random() * base * 0.3;
      if (Date.now() + delay - start > policy.wallClockMs) throw err;
      policy.onRetry?.(err, attempt, delay);
      await wait(delay);
    }
  }
}
