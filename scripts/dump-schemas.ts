import "./load-env";

import { getMcpSession } from "../lib/mcp/session";
import { messageOf } from "../lib/mcp/errors";
import { latestLinkedToken } from "../lib/swiggy-auth";

/** Prints each discovered tool's required arguments, to sanity-check validation. */
async function main() {
  const tokenRow = await latestLinkedToken();
  if (!tokenRow) throw new Error("no linked account");

  const session = await getMcpSession(tokenRow.accessToken);
  for (const t of session.tools) {
    const required = (t.inputSchema?.required as string[] | undefined) ?? [];
    console.log(
      `${(session.serverFor(t.name) ?? "?").padEnd(10)} ${t.name.padEnd(32)} ${
        required.length ? required.join(", ") : "-"
      }`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("failed:", messageOf(err));
  process.exit(1);
});
