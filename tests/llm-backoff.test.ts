import { describe, expect, it, vi } from "vitest";
import { withLlmRetry } from "../lib/llm/backoff";

function apiError(status: number, headers?: Record<string, string>) {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers });
}

describe("withLlmRetry", () => {
  it("retries a rate-limited provider and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValueOnce("ok");
    await expect(withLlmRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("retries 5xx", async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce("ok");
    await expect(withLlmRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("does not retry a bad request", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(400));
    await expect(withLlmRetry(fn)).rejects.toThrow("HTTP 400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry an auth failure", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(401));
    await expect(withLlmRetry(fn)).rejects.toThrow("HTTP 401");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours a Retry-After header instead of the backoff curve", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(429, { "retry-after": "1" }))
      .mockResolvedValueOnce("ok");
    const start = Date.now();
    await expect(withLlmRetry(fn)).resolves.toBe("ok");
    expect(Date.now() - start).toBeGreaterThanOrEqual(950);
  }, 15_000);

  it("gives up after the attempt cap", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(429));
    await expect(withLlmRetry(fn)).rejects.toThrow("HTTP 429");
    expect(fn).toHaveBeenCalledTimes(4);
  }, 30_000);
});
