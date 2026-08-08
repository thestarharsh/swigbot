import { describe, expect, it } from "vitest";
import { toOpenAiMessages } from "../lib/llm/openai-compat";
import type { ChatRequest } from "../lib/llm/types";

const req = (messages: ChatRequest["messages"]): ChatRequest => ({
  system: { stable: "STABLE", dynamic: "DYNAMIC" },
  messages,
  tools: [],
});

describe("toOpenAiMessages", () => {
  it("joins the split system prompt into the single system message", () => {
    const [system] = toOpenAiMessages(req([{ role: "user", content: "hi" }]));
    expect(system).toEqual({ role: "system", content: "STABLE\n\nDYNAMIC" });
  });

  it("omits an empty dynamic half without leaving a trailing separator", () => {
    const [system] = toOpenAiMessages({
      system: { stable: "STABLE", dynamic: "" },
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
    expect(system.content).toBe("STABLE");
  });

  it("sends a tool-calling assistant turn with null content, not an empty string", () => {
    // Providers reject "" alongside tool_calls; null is the documented shape.
    const assistant = toOpenAiMessages(
      req([
        { role: "user", content: "track it" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "c1", name: "track_food_order", input: { orderId: "o1" } }],
        },
      ]),
    ).find((m) => m.role === "assistant") as {
      content: unknown;
      tool_calls: { function: { arguments: string } }[];
    };

    expect(assistant.content).toBeNull();
    expect(assistant.tool_calls).toHaveLength(1);
    expect(JSON.parse(assistant.tool_calls[0].function.arguments)).toEqual({ orderId: "o1" });
  });

  it("replays providerExtra so Gemini thought signatures survive the round trip", () => {
    // Without the signature echoed back, the next Gemini turn 400s.
    const signature = { google: { thought_signature: "sig-abc" } };
    const assistant = toOpenAiMessages(
      req([
        { role: "user", content: "order it" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "c1",
              name: "place_food_order",
              input: {},
              providerExtra: { extra_content: signature },
            },
          ],
        },
      ]),
    ).find((m) => m.role === "assistant") as { tool_calls: { extra_content?: unknown }[] };

    expect(assistant.tool_calls[0].extra_content).toEqual(signature);
  });

  it("expands one tool_results turn into one tool message per result", () => {
    // Anthropic carries every result in a single turn; OpenAI needs one each,
    // and a missing one desynchronises the whole history.
    const out = toOpenAiMessages(
      req([
        { role: "user", content: "go" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "c1", name: "get_addresses", input: {} },
            { id: "c2", name: "get_food_cart", input: {} },
          ],
        },
        {
          role: "tool_results",
          results: [
            { toolCallId: "c1", content: "addresses" },
            { toolCallId: "c2", content: "cart is empty", isError: true },
          ],
        },
      ]),
    ) as { role: string; tool_call_id?: string; content?: string }[];

    const tools = out.filter((m) => m.role === "tool");
    expect(tools.map((t) => t.tool_call_id)).toEqual(["c1", "c2"]);
    expect(tools[0].content).toBe("addresses");
    expect(tools[1].content).toBe("ERROR: cart is empty");
  });
});
