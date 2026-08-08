import "./load-env";

import { getChatModel } from "../lib/llm";

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

/** --quick skips the plain completion: 2 requests instead of 3. */
const QUICK = process.argv.includes("--quick");

async function main() {
  const model = getChatModel();
  console.log(`provider=${model.provider} model=${model.model}${QUICK ? " (quick)" : ""}\n`);

  if (QUICK) return quick(model);

  console.log("[1/3] plain completion…");
  const plain = await model.chat({
    system: { stable: "You are a terse assistant.", dynamic: "" },
    messages: [{ role: "user", content: "Reply with exactly: PONG" }],
    tools: [],
    maxTokens: 2048,
  });
  console.log(`  text=${JSON.stringify(plain.text.slice(0, 120))} stop=${plain.stopReason}\n`);

  console.log("[2/3] tool-calling round 1 (should call get_addresses)…");
  const r1 = await model.chat({
    system: {
      stable: "You are a food ordering agent. Use tools to get real data. Never guess addresses.",
      dynamic: "",
    },
    messages: [{ role: "user", content: "I want spicy biryani delivered to my home." }],
    tools: TOOLS,
    maxTokens: 4096,
  });
  console.log(`  stop=${r1.stopReason} toolCalls=${JSON.stringify(r1.toolCalls)}`);
  console.log(`  text=${JSON.stringify(r1.text.slice(0, 200))}\n`);

  if (!r1.toolCalls.length) {
    console.log("✗ model did not emit a tool call - it cannot drive this agent");
    process.exit(1);
  }

  console.log("[3/3] tool-result round 2 (multi-turn tool loop)…");
  const r2 = await model.chat({
    system: {
      stable: "You are a food ordering agent. Use tools to get real data. Never guess addresses.",
      dynamic: "",
    },
    messages: [
      { role: "user", content: "I want spicy biryani delivered to my home." },
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
    maxTokens: 4096,
  });
  console.log(`  stop=${r2.stopReason} toolCalls=${JSON.stringify(r2.toolCalls)}`);
  console.log(`  text=${JSON.stringify(r2.text.slice(0, 200))}\n`);
  console.log("✓ model handles a multi-turn tool loop");
}

const SYSTEM = {
  stable: "You are a food ordering agent. Use tools to get real data. Never guess addresses.",
  dynamic: "",
};

/** Does it call a tool, and does it chain off the result. */
async function quick(model: ReturnType<typeof getChatModel>) {
  const t0 = Date.now();
  const r1 = await model.chat({
    system: SYSTEM,
    messages: [{ role: "user", content: "I want spicy biryani delivered to my home." }],
    tools: TOOLS,
    maxTokens: 2048,
  });
  const ms1 = Date.now() - t0;
  console.log(`[1/2] ${ms1}ms  stop=${r1.stopReason}  calls=${r1.toolCalls.map((c) => c.name).join(",") || "none"}`);
  if (!r1.toolCalls.length) {
    console.log("✗ no tool call - cannot drive the agent");
    process.exit(1);
  }

  const t1 = Date.now();
  const r2 = await model.chat({
    system: SYSTEM,
    messages: [
      { role: "user", content: "I want spicy biryani delivered to my home." },
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
    maxTokens: 2048,
  });
  const ms2 = Date.now() - t1;
  const chained = r2.toolCalls.find((c) => c.name === "search_restaurants");
  console.log(`[2/2] ${ms2}ms  stop=${r2.stopReason}  calls=${r2.toolCalls.map((c) => c.name).join(",") || "none"}`);
  console.log(`      args=${JSON.stringify(chained?.input ?? {})}`);
  console.log(
    chained?.input?.addressId === "addr_1"
      ? `✓ usable  (avg ${Math.round((ms1 + ms2) / 2)}ms/call)`
      : "⚠ called a tool but did not use the returned addressId",
  );
}

main().catch((err) => {
  console.error("✗ probe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
