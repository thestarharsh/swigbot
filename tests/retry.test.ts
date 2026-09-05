import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../lib/mcp/retry";

/** Injected so the suite never spends the real 500ms→8s budget. */
const noSleep = () => Promise.resolve();

describe("withRetry (idempotent tools only)", () => {
  it("retries transient upstream failures with backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 503 Service Unavailable"))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry terminal/bad-input failures", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid addressId"));
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow("Invalid addressId");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 502"));
    await expect(withRetry(fn, { maxAttempts: 2, sleep: noSleep })).rejects.toThrow("HTTP 502");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("follows the documented 500ms doubling curve, capped at 8s", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 502"));
    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toThrow("HTTP 502");
    expect(delays).toHaveLength(4);
    // Base doubles; jitter adds up to 30% on top.
    for (const [i, base] of [500, 1000, 2000, 4000].entries()) {
      expect(delays[i]).toBeGreaterThanOrEqual(base);
      expect(delays[i]).toBeLessThanOrEqual(base * 1.3);
    }
  });

  it("stops before the wall-clock budget instead of sleeping past it", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 502"));
    await expect(withRetry(fn, { wallClockMs: 100, sleep: noSleep })).rejects.toThrow("HTTP 502");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
