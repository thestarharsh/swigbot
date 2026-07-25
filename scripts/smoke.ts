import "./load-env";

import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { getClientId, beginAuth, redirectUri } from "../lib/swiggy-auth";
import { ensureUser } from "../lib/agent";

/**
 * Smoke test of everything that works without a phone in hand: database,
 * live Dynamic Client Registration, and minting a real PKCE login URL.
 */
async function main() {
  await db.execute(sql`select 1`);
  console.log("✓ database reachable");

  const clientId = await getClientId();
  console.log(`✓ Swiggy DCR ok - client_id: ${clientId}`);
  console.log(`  redirect_uri: ${redirectUri()}`);

  const user = await ensureUser("cli", "smoke-test", "smoke");
  const url = await beginAuth(user.id);
  console.log(`✓ PKCE auth URL minted:\n  ${url}`);
  console.log("\nOpen that URL in a browser to complete a real login (phone + OTP).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ smoke test failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
