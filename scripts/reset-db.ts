import "./load-env";

import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { messageOf } from "../lib/mcp/errors";

/** Wipes every row, keeping the schema. Linked tokens go too: users re-do OTP. */
const TABLES = [
  "turn_locks",
  "messages",
  "tool_call_log",
  "processed_updates",
  "oauth_sessions",
  "swiggy_tokens",
  "oauth_client",
  "users",
];

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("Refusing to wipe data without --yes.\n  pnpm db:reset --yes");
    process.exit(1);
  }

  const target = (process.env.DATABASE_URL ?? "").replace(/:[^:@/]+@/, ":***@");
  console.log(`Target: ${target}`);

  for (const table of TABLES) {
    const [{ count }] = (
      await db.execute(sql.raw(`select count(*)::int as count from public.${table}`))
    ).rows as { count: number }[];
    console.log(`  ${table}: ${count} rows`);
  }

  await db.execute(
    sql.raw(
      `truncate table ${TABLES.map((t) => `public.${t}`).join(", ")} restart identity cascade`,
    ),
  );

  console.log("\n✓ all tables truncated, identities restarted");
  console.log("Next login re-runs Dynamic Client Registration automatically.");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ reset failed:", messageOf(err));
  process.exit(1);
});
