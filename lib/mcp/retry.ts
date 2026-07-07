import { isRetryableError } from "./errors";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Backoff per Swiggy's ship-to-production doc: 500ms doubling to 8s with
 * jitter, max 5 attempts, 30s wall clock. Idempotent tools only; order
 * placement uses check-then-retry in guardrails.ts instead.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 5, wallClockMs = 30_000 }: { maxAttempts?: number; wallClockMs?: number } = {},
): Promise<T> {
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts || !isRetryableError(err)) throw err;
      const base = Math.min(500 * 2 ** (attempt - 1), 8000);
      const delay = base + Math.random() * base * 0.3;
      if (Date.now() + delay - start > wallClockMs) throw err;
      await sleep(delay);
    }
  }
}

export { sleep };
