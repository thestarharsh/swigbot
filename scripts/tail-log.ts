import "./load-env";

import { sql } from "drizzle-orm";
import { db } from "../lib/db";

const LIMIT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 12);
const FULL = process.argv.includes("--full");
const CLIP = FULL ? 100_000 : 300;

/** Recent conversation and tool activity. `pnpm tail [n] [--full]`. */
async function main() {
  const tools = (
    await db.execute(sql`
      select tool, status, duration_ms, coalesce(error_message, '') as err,
             to_char(created_at, 'HH24:MI:SS') as ts
      from public.tool_call_log
      order by id desc limit ${LIMIT}
    `)
  ).rows as Record<string, unknown>[];

  console.log("=== tool calls (newest first) ===");
  for (const r of tools) {
    console.log(
      `${r.ts} ${String(r.tool).padEnd(22)} ${String(r.status).padEnd(13)} ` +
        `${String(r.duration_ms).padStart(6)}ms ${String(r.err).slice(0, 120)}`,
    );
  }

  const rows = (
    await db.execute(sql`
      select id, content, to_char(created_at, 'HH24:MI:SS') as ts
      from public.messages order by id desc limit ${LIMIT}
    `)
  ).rows as { id: number; content: Record<string, unknown>; ts: string }[];

  console.log("\n=== messages (oldest first) ===");
  for (const row of rows.reverse()) {
    const c = row.content as {
      role: string;
      content?: string;
      toolCalls?: { name: string; input: unknown }[];
      results?: { content: string; isError?: boolean }[];
    };
    const head = `${String(row.id).padStart(4)} ${row.ts}`;

    if (c.role === "user") {
      console.log(`${head} USER  ${c.content}`);
    } else if (c.role === "assistant") {
      if (c.content) console.log(`${head} BOT   ${c.content.slice(0, CLIP)}`);
      for (const call of c.toolCalls ?? []) {
        console.log(`${head} CALL  ${call.name}(${JSON.stringify(call.input)})`);
      }
    } else {
      for (const res of c.results ?? []) {
        console.log(
          `${head} RESULT${res.isError ? "(error)" : ""} ${res.content.slice(0, CLIP)}`,
        );
      }
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
