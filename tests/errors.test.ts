import { describe, expect, it } from "vitest";
import { SwiggyAuthError, isAuthError, isRetryableError, messageOf } from "../lib/mcp/errors";

// Problem 16: v1 has no symbolic error codes - classification is by HTTP
// status, JSON-RPC code, and message text.
describe("error classification", () => {
  it("detects auth failures (401 / 419 / -32001 / session text)", () => {
    expect(isAuthError(new Error("HTTP 401 Unauthorized"))).toBe(true);
    expect(isAuthError(new Error("Request failed with status 419"))).toBe(true);
    expect(isAuthError(Object.assign(new Error("MCP error"), { code: -32001 }))).toBe(true);
    expect(isAuthError(new Error("Cannot resolve session"))).toBe(true);
    expect(isAuthError(new SwiggyAuthError())).toBe(true);
    expect(isAuthError(new Error("restaurant closed"))).toBe(false);
  });

  it("marks upstream/transport failures retryable", () => {
    expect(isRetryableError(new Error("HTTP 504 Gateway Timeout"))).toBe(true);
    expect(isRetryableError(new Error("upstream timeout while calling service"))).toBe(true);
    expect(isRetryableError(new Error("HTTP 502 Bad Gateway"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableError(new Error("read ECONNRESET"))).toBe(true);
    expect(isRetryableError(Object.assign(new Error("internal"), { code: -32603 }))).toBe(true);
  });

  it("never retries auth or bad-input failures", () => {
    expect(isRetryableError(new Error("HTTP 401 Unauthorized"))).toBe(false);
    expect(isRetryableError(new Error("Invalid addressId"))).toBe(false);
    expect(isRetryableError(new Error("item out of stock"))).toBe(false);
  });

  it("messageOf reads anything thrown", () => {
    expect(messageOf(new Error("boom"))).toBe("boom");
    expect(messageOf("plain string")).toBe("plain string");
    expect(messageOf(undefined)).toBe("undefined");
  });
});
