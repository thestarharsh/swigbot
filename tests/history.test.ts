import { describe, expect, it } from "vitest";
import { sanitizeHistory } from "../lib/llm/history";
import type { ChatMessage } from "../lib/llm/types";

const call = (id: string) => ({ id, name: "get_food_cart", input: {} });
const result = (id: string) => ({ toolCallId: id, content: "{}" });

describe("sanitizeHistory", () => {
  it("backfills a synthetic error result when a turn crashed mid tool round", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "add biryani" },
      { role: "assistant", content: "", toolCalls: [call("t1")] },
      { role: "user", content: "hello?" },
    ];
    const out = sanitizeHistory(history);
    expect(out).toHaveLength(4);
    expect(out[2]).toEqual({
      role: "tool_results",
      results: [expect.objectContaining({ toolCallId: "t1", isError: true })],
    });
  });

  it("backfills results for a trailing assistant tool call", () => {
    const out = sanitizeHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "", toolCalls: [call("t1"), call("t2")] },
    ]);
    expect(out[2].role).toBe("tool_results");
    expect(out[2].role === "tool_results" && out[2].results).toHaveLength(2);
  });

  it("completes partially recorded results", () => {
    const out = sanitizeHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "", toolCalls: [call("t1"), call("t2")] },
      { role: "tool_results", results: [result("t1")] },
      { role: "assistant", content: "done" },
    ]);
    const results = out[2].role === "tool_results" ? out[2].results : [];
    expect(results.map((r) => r.toolCallId).sort()).toEqual(["t1", "t2"]);
  });

  it("drops orphaned tool results left behind by the history window", () => {
    const out = sanitizeHistory([
      { role: "tool_results", results: [result("gone")] },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe("user");
  });

  it("drops leading non-user messages so history starts with the user", () => {
    const out = sanitizeHistory([
      { role: "assistant", content: "welcome back" },
      { role: "user", content: "hi" },
    ]);
    expect(out[0]).toEqual({ role: "user", content: "hi" });
  });

  it("drops empty assistant messages", () => {
    const out = sanitizeHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "" },
      { role: "user", content: "still there?" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("never mutates the caller's own message objects", () => {
    // `history` is built from persisted rows; back-filling in place rewrote
    // the object the row had been read into.
    const results = [result("t1")];
    const partial: ChatMessage = { role: "tool_results", results };
    const history: ChatMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "", toolCalls: [call("t1"), call("t2")] },
      partial,
      { role: "assistant", content: "done" },
    ];
    const out = sanitizeHistory(history);

    expect(results).toHaveLength(1);
    expect(partial).toEqual({ role: "tool_results", results: [result("t1")] });
    expect(out[2].role === "tool_results" && out[2].results).toHaveLength(2);
    expect(out[2]).not.toBe(partial);
  });

  it("leaves a well-formed history untouched", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "add biryani" },
      { role: "assistant", content: "", toolCalls: [call("t1")] },
      { role: "tool_results", results: [result("t1")] },
      { role: "assistant", content: "Added. Anything else?" },
    ];
    expect(sanitizeHistory(history)).toEqual(history);
  });
});
