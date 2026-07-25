import { describe, expect, it } from "vitest";
import { isTransientDbError } from "../lib/db";

describe("isTransientDbError", () => {
  it("recognises the failures a suspended Neon compute produces", () => {
    // Exactly what killed a live turn: pool handed out a client whose socket
    // had been closed while the compute was suspended.
    const outer = new Error(
      'Failed query: insert into "processed_updates" ("update_id") values ($1)',
    );
    outer.cause = new Error("Connection terminated unexpectedly");
    expect(isTransientDbError(outer)).toBe(true);

    for (const msg of [
      "Connection terminated due to connection timeout",
      "Connection terminated unexpectedly",
      "read ECONNRESET",
      "connect ETIMEDOUT",
      "socket hang up",
      "terminating connection due to administrator command",
    ]) {
      expect(isTransientDbError(new Error(msg)), msg).toBe(true);
    }
  });

  it("does not retry genuine query errors", () => {
    for (const msg of [
      'relation "users" does not exist',
      'null value in column "user_id" violates not-null constraint',
      "syntax error at or near SELEC",
      "duplicate key value violates unique constraint",
    ]) {
      expect(isTransientDbError(new Error(msg)), msg).toBe(false);
    }
    expect(isTransientDbError("not an error")).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });
});
