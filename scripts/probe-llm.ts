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

async function main() {
  const model = getChatModel();
  console.log(`provider=${model.provider} model=${model.model}\n`);

  console.log("[1/3] plain completion…");
  const plain = await model.chat({
    system: { stable: "You are a terse assistant.", dynamic: "" },
    messages: [{ role: "user", content: "Reply with exactly: PONG" }],
    tools: [],
    maxTokens: 64,
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
    maxTokens: 512,
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
    maxTokens: 512,
  });
  console.log(`  stop=${r2.stopReason} toolCalls=${JSON.stringify(r2.toolCalls)}`);
  console.log(`  text=${JSON.stringify(r2.text.slice(0, 200))}\n`);
  console.log("✓ model handles a multi-turn tool loop");
}

main().catch((err) => {
  console.error("✗ probe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
