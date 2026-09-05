import "./load-env";

import { getTableColumns, getTableName, is, sql, Table } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { messageOf } from "../lib/mcp/errors";

/**
 * Confirms the live server and that every table/column the code expects
 * exists. Derived from the Drizzle schema rather than hand-maintained, so a
 * column added in schema.ts can never be forgotten here.
 */
const EXPECTED: Record<string, string[]> = Object.fromEntries(
  Object.values(schema)
    .filter((t) => is(t, Table))
    .map((table) => [
      getTableName(table),
      Object.values(getTableColumns(table)).map((c) => c.name),
    ]),
);

async function main() {
  const version = (await db.execute(sql`select version()`)).rows[0] as { version: string };
  console.log(version.version.split(" on ")[0]);

  const cols = (
    await db.execute(sql`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `)
  ).rows as { table_name: string; column_name: string; data_type: string }[];

  const actual = new Map<string, Map<string, string>>();
  for (const c of cols) {
    if (!actual.has(c.table_name)) actual.set(c.table_name, new Map());
    actual.get(c.table_name)!.set(c.column_name, c.data_type);
  }

  let failures = 0;
  for (const [table, expected] of Object.entries(EXPECTED)) {
    const found = actual.get(table);
    if (!found) {
      console.log(`✗ ${table}: MISSING`);
      failures++;
      continue;
    }
    const missing = expected.filter((c) => !found.has(c));
    const extra = [...found.keys()].filter((c) => !expected.includes(c));
    if (missing.length || extra.length) {
      console.log(`✗ ${table}: missing [${missing.join(", ")}] unexpected [${extra.join(", ")}]`);
      failures++;
    } else {
      console.log(`✓ ${table}: ${expected.length} columns`);
    }
  }

  const counts = (
    await db.execute(sql`
      select
        (select count(*) from public.users) as users,
        (select count(*) from public.messages) as messages,
        (select count(*) from public.swiggy_tokens) as tokens,
        (select count(*) from public.tool_call_log) as tool_calls,
        (select count(*) from public.oauth_client) as dcr,
        (select count(*) from public.oauth_sessions) as oauth_sessions,
        (select count(*) from public.processed_updates) as updates,
        (select count(*) from public.turn_locks) as turn_locks
    `)
  ).rows[0];
  console.log(`\nrow counts: ${JSON.stringify(counts)}`);

  const jsonb = actual.get("messages")?.get("content");
  const big = actual.get("processed_updates")?.get("update_id");
  console.log(`messages.content=${jsonb}  processed_updates.update_id=${big}`);

  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ verify failed:", messageOf(err));
  process.exit(1);
});
