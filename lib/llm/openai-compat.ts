import OpenAI from "openai";
import type {
  ChatModel,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  StopReason,
  ToolCall,
} from "./types";

const STOP_MAP: Record<string, StopReason> = {
  stop: "end",
  tool_calls: "tool_use",
  length: "max_tokens",
};

type OAMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function toOpenAiMessages(req: ChatRequest): OAMessage[] {
  const out: OAMessage[] = [
    { role: "system", content: [req.system.stable, req.system.dynamic].filter(Boolean).join("\n\n") },
  ];
  for (const m of req.messages) {
    switch (m.role) {
      case "user":
        out.push({ role: "user", content: m.content });
        break;
      case "assistant":
        out.push({
          role: "assistant",
          content: m.content || null,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: JSON.stringify(tc.input) },
                })),
              }
            : {}),
        });
        break;
      case "tool_results":
        // OpenAI-compat requires one `tool` message per result.
        for (const r of m.results) {
          out.push({
            role: "tool",
            tool_call_id: r.toolCallId,
            content: r.isError ? `ERROR: ${r.content}` : r.content,
          });
        }
        break;
    }
  }
  return out;
}

export class OpenAiCompatChatModel implements ChatModel {
  private client: OpenAI;

  constructor(
    readonly provider: string,
    readonly model: string,
    apiKey: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // OpenAI's current models reject max_tokens in favor of
    // max_completion_tokens; other OpenAI-compatible hosts still expect max_tokens.
    const maxTokens = req.maxTokens ?? 4096;
    const completion = await this.client.chat.completions.create({
      model: this.model,
      ...(this.provider === "openai"
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      messages: toOpenAiMessages(req),
      ...(req.tools.length
        ? {
            tools: req.tools.map((t) => ({
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              },
            })),
          }
        : {}),
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error("LLM returned no choices");

    const toolCalls: ToolCall[] = [];
    for (const tc of choice.message.tool_calls ?? []) {
      if (tc.type !== "function") continue;
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = { _raw: tc.function.arguments };
      }
      toolCalls.push({ id: tc.id, name: tc.function.name, input });
    }

    return {
      text: choice.message.content ?? "",
      toolCalls,
      stopReason: STOP_MAP[choice.finish_reason ?? ""] ?? "other",
    };
  }
}
