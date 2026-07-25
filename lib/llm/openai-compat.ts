import OpenAI from "openai";
import { withLlmRetry } from "./backoff";
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

/** OpenRouter's limit on the `models` fallback array, primary included. */
const MAX_ROUTED_MODELS = 3;

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
        // One `tool` message per result, unlike Anthropic's single user turn.
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
    /** OpenRouter only: models it may route to when the primary is unavailable. */
    private readonly fallbacks: string[] = [],
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // Current OpenAI models reject max_tokens; other compatible hosts still
    // require it.
    const maxTokens = req.maxTokens ?? 4096;
    const body = {
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
      // Non-standard field OpenRouter reads to fail over between models.
      // It rejects more than three entries, so extra fallbacks are dropped.
      ...(this.provider === "openrouter" && this.fallbacks.length
        ? { models: [this.model, ...this.fallbacks].slice(0, MAX_ROUTED_MODELS) }
        : {}),
    };

    const completion = await withLlmRetry(() => this.client.chat.completions.create(body));

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
