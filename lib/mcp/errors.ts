/**
 * Swiggy MCP v1 emits no symbolic error codes (docs/reference/errors.md), so
 * classification is by HTTP status, JSON-RPC code, and message text.
 */

/** Swiggy session expired or revoked (HTTP 401 / 419 / JSON-RPC -32001). */
export class SwiggyAuthError extends Error {
  constructor(message = "Swiggy session expired") {
    super(message);
    this.name = "SwiggyAuthError";
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function codeOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "number") {
    return err.code;
  }
  return undefined;
}

export function isAuthError(err: unknown): boolean {
  if (err instanceof SwiggyAuthError) return true;
  if (codeOf(err) === -32001) return true;
  return /\b401\b|\b419\b|unauthorized|session expired|cannot resolve session/i.test(
    messageOf(err),
  );
}

/** Transient upstream/transport failure, safe to backoff-retry for idempotent tools. */
export function isRetryableError(err: unknown): boolean {
  if (isAuthError(err)) return false;
  if (codeOf(err) === -32603) return true;
  return /\b50[0234]\b|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed|network|socket hang up|overloaded/i.test(
    messageOf(err),
  );
}

/** Bad input (HTTP 400, "Invalid ...", "Missing ..."): fix the args, never retry. */
export function isBadInputError(err: unknown): boolean {
  return /\b400\b|^invalid |^missing |\binvalid_request\b/i.test(messageOf(err));
}
