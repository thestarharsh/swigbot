import "./load-env";

import { getChatModel } from "../lib/llm";
import type { ChatModel, SystemPrompt } from "../lib/llm/types";
import { messageOf } from "../lib/mcp/errors";

const TOOLS = [
  {
    name: "get_addresses",
    description: "List the user's saved delivery addresses.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_restaurants",
    description: "Search restaurants near an address.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "cuisine or dish" },
        addressId: { type: "string" },
      },
      required: ["query", "addressId"],
    },
  },
];

const SYSTEM: SystemPrompt = {
  stable: "You are a food ordering agent. Use tools to get real data. Never guess addresses.",
  dynamic: "",
};

const PROMPT = "I want spicy biryani delivered to my home.";

/** --quick skips the plain completion: 2 requests instead of 3. */
const QUICK = process.argv.includes("--quick");

/**
 * The probe's whole point: does the model emit a tool call, and does it chain
 * off the returned id. Exits non-zero when it cannot, since such a model
 * cannot drive the agent at all.
 */
async function runToolLoop(model: ChatModel, maxTokens: number) {
  const t0 = Date.now();
  const r1 = await model.chat({
    system: SYSTEM,
    messages: [{ role: "user", content: PROMPT }],
    tools: TOOLS,
    maxTokens,
  });
  const ms1 = Date.now() - t0;
  console.log(
    `  round 1: ${ms1}ms stop=${r1.stopReason} calls=${
      r1.toolCalls.map((c) => c.name).join(",") || "none"
    }`,
  );
  console.log(`  text=${JSON.stringify(r1.text.slice(0, 200))}`);
  if (!r1.toolCalls.length) {
    console.log("✗ model did not emit a tool call - it cannot drive this agent");
    process.exit(1);
  }

  const t1 = Date.now();
  const r2 = await model.chat({
    system: SYSTEM,
    messages: [
      { role: "user", content: PROMPT },
      { role: "assistant", content: r1.text, toolCalls: r1.toolCalls },
      {
        role: "tool_results",
        results: r1.toolCalls.map((c) => ({
          toolCallId: c.id,
          content: JSON.stringify([{ id: "addr_1", label: "Home", area: "Koramangala" }]),
          isError: false,
        })),
      },
    ],
    tools: TOOLS,
    maxTokens,
  });
  const ms2 = Date.now() - t1;
  const chained = r2.toolCalls.find((c) => c.name === "search_restaurants");
  console.log(
    `  round 2: ${ms2}ms stop=${r2.stopReason} calls=${
      r2.toolCalls.map((c) => c.name).join(",") || "none"
    }`,
  );
  console.log(`  args=${JSON.stringify(chained?.input ?? {})}`);
  console.log(
    chained?.input?.addressId === "addr_1"
      ? `✓ usable (avg ${Math.round((ms1 + ms2) / 2)}ms/call)`
      : "⚠ called a tool but did not use the returned addressId",
  );
}

async function main() {
  const model = getChatModel();
  console.log(`provider=${model.provider} model=${model.model}${QUICK ? " (quick)" : ""}\n`);

  if (!QUICK) {
    console.log("plain completion…");
    const plain = await model.chat({
      system: { stable: "You are a terse assistant.", dynamic: "" },
      messages: [{ role: "user", content: "Reply with exactly: PONG" }],
      tools: [],
      maxTokens: 2048,
    });
    console.log(`  text=${JSON.stringify(plain.text.slice(0, 120))} stop=${plain.stopReason}\n`);
  }

  console.log("tool loop…");
  await runToolLoop(model, QUICK ? 2048 : 4096);
}

main().catch((err) => {
  console.error("✗ probe failed:", messageOf(err));
  process.exit(1);
});
