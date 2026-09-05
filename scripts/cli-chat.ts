import "./load-env";

import readline from "readline";
import { ensureUser, runAgentTurn } from "../lib/agent";
import { getChatModel } from "../lib/llm";
import { messageOf } from "../lib/mcp/errors";
import { logout } from "../lib/swiggy-auth";

/**
 * Local chat surface. Keep `pnpm dev` running so the Swiggy login link has
 * a callback to land on.
 */
async function main() {
  const user = await ensureUser("cli", process.env.USER ?? "local", process.env.USER ?? "local");

  try {
    const model = getChatModel();
    console.log(
      `SwigBot CLI - LLM: ${model.provider}/${model.model}. Type a message, or 'exit' to quit.\n`,
    );
  } catch (err) {
    console.log(
      `SwigBot CLI - ⚠️  ${messageOf(err)}\n` +
        `Account linking will work, but chat needs an LLM key in .env.local.\n` +
        `Edit .env.local, then restart this CLI (env is read at startup).\n`,
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  for (;;) {
    const line = (await ask("you> ")).trim();
    if (!line) continue;
    if (line === "exit" || line === "quit") break;

    if (line === "/logout") {
      await logout(user.id);
      console.log(
        "\nswigbot> Done. Your Swiggy account has been unlinked. Say hi to get a new login link.\n",
      );
      continue;
    }

    try {
      const reply = await runAgentTurn(user, "cli", line);
      console.log(`\nswigbot> ${reply}\n`);
    } catch (err) {
      console.error("error:", messageOf(err));
    }
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
