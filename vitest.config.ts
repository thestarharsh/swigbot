import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Deliberately unreachable: the guardrail tests import lib/db for its
    // tool-call log, and must never write to a real database. Failed log
    // inserts are swallowed by design, so the fake port is enough.
    env: {
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    },
  },
});
