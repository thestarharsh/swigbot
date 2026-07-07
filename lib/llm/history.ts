import type { ChatMessage, ToolCall, ToolResult } from "./types";

/**
 * Providers reject histories where a tool call lacks its result, a result
 * lacks its call, or the first message isn't from the user. Both happen to
 * persisted history: a turn can crash between persisting the assistant
 * message and its results, and the history window can trim mid tool round.
 */
export function sanitizeHistory(history: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];

  for (const msg of history) {
    if (msg.role === "tool_results") {
      const prev = out[out.length - 1];
      if (prev?.role !== "assistant" || !prev.toolCalls?.length) continue;
      const expected = new Set(prev.toolCalls.map((c) => c.id));
      const results = msg.results.filter((r) => expected.has(r.toolCallId));
      if (results.length) out.push({ role: "tool_results", results });
      continue;
    }
    if (msg.role === "assistant" && !msg.content && !msg.toolCalls?.length) continue;
    closeOpenToolRound(out);
    out.push(msg);
  }
  closeOpenToolRound(out);

  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** Backfills a synthetic error result for any tool call still awaiting one. */
function closeOpenToolRound(out: ChatMessage[]): void {
  const last = out[out.length - 1];

  if (last?.role === "assistant" && last.toolCalls?.length) {
    out.push({ role: "tool_results", results: last.toolCalls.map(interruptedResult) });
    return;
  }

  const prev = out[out.length - 2];
  if (last?.role === "tool_results" && prev?.role === "assistant" && prev.toolCalls?.length) {
    const have = new Set(last.results.map((r) => r.toolCallId));
    const missing = prev.toolCalls.filter((c) => !have.has(c.id));
    if (missing.length) last.results = [...last.results, ...missing.map(interruptedResult)];
  }
}

const interruptedResult = (call: ToolCall): ToolResult => ({
  toolCallId: call.id,
  content: "The turn was interrupted before this tool returned a result.",
  isError: true,
});
