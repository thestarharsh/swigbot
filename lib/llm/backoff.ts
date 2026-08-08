const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_ATTEMPTS = 4;
const WALL_CLOCK_MS = 45_000;
const BASE_DELAY_MS = 800;
const MAX_DELAY_MS = 8_000;

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; statusCode?: number } | null;
  return e?.status ?? e?.statusCode;
}

/** Providers put the hint on the response headers; shapes differ per SDK. */
function retryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown })?.headers;
  if (!headers) return undefined;
  const raw =
    typeof (headers as Headers).get === "function"
      ? (headers as Headers).get("retry-after")
      : (headers as Record<string, string>)["retry-after"];
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, MAX_DELAY_MS) : undefined;
}

function isTransient(err: unknown): boolean {
  const status = statusOf(err);
  if (status === 429 || status === 408 || status === 409) return true;
  if (status !== undefined && status >= 500) return true;
  if (status !== undefined) return false;
  // No status: connection reset, DNS, timeout.
  return err instanceof Error;
}

/** Retries transient provider failures; free pools 429 often enough to matter. */
export async function withLlmRetry<T>(
  fn: () => Promise<T>,
  { retryRateLimit = true }: { retryRateLimit?: boolean } = {},
): Promise<T> {
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      // With a model left to try, waiting out a rate limit is wasted time.
      if (!retryRateLimit && statusOf(err) === 429) throw err;
      if (attempt >= MAX_ATTEMPTS || !isTransient(err)) throw err;
      const base = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      const delay = retryAfterMs(err) ?? base + Math.random() * base * 0.3;
      if (Date.now() + delay - start > WALL_CLOCK_MS) throw err;
      console.warn(
        `[llm] transient ${statusOf(err) ?? "network"} error, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${Math.round(delay)}ms`,
      );
      await sleep(delay);
    }
  }
}
