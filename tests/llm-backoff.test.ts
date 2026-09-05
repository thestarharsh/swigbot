import { describe, expect, it, vi } from "vitest";
import { withLlmRetry } from "../lib/llm/backoff";

function apiError(status: number, headers?: Record<string, string>) {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers });
}

/** Injected so the suite never spends the real 800ms→8s budget. */
const noSleep = () => Promise.resolve();

describe("withLlmRetry", () => {
  it("retries a rate-limited provider and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce("ok");
    await expect(withLlmRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx", async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce("ok");
    await expect(withLlmRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a bad request", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(400));
    await expect(withLlmRetry(fn, { sleep: noSleep })).rejects.toThrow("HTTP 400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry an auth failure", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(401));
    await expect(withLlmRetry(fn, { sleep: noSleep })).rejects.toThrow("HTTP 401");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours a Retry-After header instead of the backoff curve", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(429, { "retry-after": "3" }))
      .mockResolvedValueOnce("ok");
    await expect(
      withLlmRetry(fn, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).resolves.toBe("ok");
    // Exactly the header, not the 800ms first step or anything jittered.
    expect(delays).toEqual([3000]);
  });

  it("caps a hostile Retry-After at the max delay", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(429, { "retry-after": "600" }))
      .mockResolvedValueOnce("ok");
    await expect(
      withLlmRetry(fn, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).resolves.toBe("ok");
    expect(delays).toEqual([8000]);
  });

  it("skips a rate limit outright when a fallback model is still to come", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(429));
    await expect(withLlmRetry(fn, { retryRateLimit: false, sleep: noSleep })).rejects.toThrow(
      "HTTP 429",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt cap", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(429));
    await expect(withLlmRetry(fn, { sleep: noSleep })).rejects.toThrow("HTTP 429");
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
