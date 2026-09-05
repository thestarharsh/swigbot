import "./load-env";

import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { getMcpSession } from "../lib/mcp/session";
import { messageOf } from "../lib/mcp/errors";
import { executeGuardedTool } from "../lib/mcp/guardrails";
import { latestLinkedToken } from "../lib/swiggy-auth";

/**
 * Post-login integration test, no LLM key needed: connects all three MCP
 * servers with the most recent linked account, lists discovered tools, and
 * calls get_addresses through the full guarded path.
 */
async function main() {
  const tokenRow = await latestLinkedToken();

  if (!tokenRow) {
    console.log(
      "No linked Swiggy account yet.\n" +
        "Run `pnpm dev` + `pnpm cli`, send any message, open the login link it\n" +
        "returns (phone + OTP), then re-run `pnpm smoke:tools`.",
    );
    process.exit(2);
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, tokenRow.userId));
  console.log(
    `Using linked account: user #${user.id} (${user.platform}:${user.platformUserId}), ` +
      `token valid until ${tokenRow.expiresAt.toISOString()}`,
  );

  const session = await getMcpSession(tokenRow.accessToken);
  const byServer = new Map<string, string[]>();
  for (const t of session.tools) {
    const server = session.serverFor(t.name) ?? "?";
    byServer.set(server, [...(byServer.get(server) ?? []), t.name]);
  }
  console.log(`\n✓ connected - ${session.tools.length} tools discovered:`);
  for (const [server, names] of byServer) {
    console.log(`  ${server} (${names.length}): ${names.join(", ")}`);
  }
  if (session.tools.length === 0) {
    console.error("\n✗ no tools discovered - all servers unreachable or token rejected");
    process.exit(1);
  }

  console.log(`\nCalling get_addresses through the guarded path (the docs' wiring test)…`);
  const result = await executeGuardedTool(session, user.id, "get_addresses", {});
  console.log(result.isError ? "✗ tool returned an error:" : "✓ result:");
  console.log(result.text.slice(0, 1500) + (result.text.length > 1500 ? "\n…(truncated)" : ""));

  console.log(
    result.isError
      ? "\nWiring reached Swiggy but the call failed - see message above."
      : "\n✓ You're wired up (per the developer quickstart's success criterion).",
  );
  process.exit(result.isError ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ failed:", messageOf(err));
  process.exit(1);
});
