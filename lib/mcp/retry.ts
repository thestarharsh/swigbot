import { backoff } from "../backoff";
import { sleep } from "../util/sleep";
import { isRetryableError } from "./errors";

/**
 * Backoff per Swiggy's ship-to-production doc: 500ms doubling to 8s with
 * jitter, max 5 attempts, 30s wall clock. Idempotent tools only; order
 * placement uses check-then-retry in guardrails.ts instead.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 5,
    wallClockMs = 30_000,
    sleep: sleepFn,
  }: {
    maxAttempts?: number;
    wallClockMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  return backoff(fn, {
    maxAttempts,
    wallClockMs,
    baseDelayMs: 500,
    maxDelayMs: 8_000,
    isRetryable: isRetryableError,
    sleep: sleepFn,
  });
}

export { sleep };
