import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../lib/mcp/retry";

describe("withRetry (idempotent tools only)", () => {
  it("retries transient upstream failures with backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 503 Service Unavailable"))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry terminal/bad-input failures", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid addressId"));
    await expect(withRetry(fn)).rejects.toThrow("Invalid addressId");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 502"));
    await expect(withRetry(fn, { maxAttempts: 2 })).rejects.toThrow("HTTP 502");
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10_000);
});
