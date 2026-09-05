import OpenAI from "openai";
import { withLlmRetry } from "./backoff";
import type { ChatModel, ChatRequest, ChatResponse, StopReason, ToolCall } from "./types";

const STOP_MAP: Record<string, StopReason> = {
  stop: "end",
  tool_calls: "tool_use",
  length: "max_tokens",
};

type OAMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** OpenRouter's limit on the `models` fallback array, primary included. */
const MAX_ROUTED_MODELS = 3;

export function toOpenAiMessages(req: ChatRequest): OAMessage[] {
  const out: OAMessage[] = [
    {
      role: "system",
      content: [req.system.stable, req.system.dynamic].filter(Boolean).join("\n\n"),
    },
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
                  ...(tc.providerExtra ?? {}),
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
    /** Models to try when the primary is rate limited or unavailable. */
    private readonly fallbacks: string[] = [],
  ) {
    // withLlmRetry is the only retry layer; SDK retries would nest inside it.
    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 0 });
  }

  /**
   * One call, with error-shaped 200 responses turned into real errors.
   * OpenRouter reports upstream failures that way and the SDK does not throw,
   * so a retryable rate limit would surface as a TypeError on `choices`.
   */
  private async createChecked(
    body: Record<string, unknown>,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const res = await this.client.chat.completions.create(
      body as unknown as Parameters<typeof this.client.chat.completions.create>[0],
    );
    const embedded = (res as unknown as { error?: { message?: string; code?: number } }).error;
    if (embedded) {
      throw Object.assign(new Error(embedded.message ?? "LLM provider error"), {
        status: embedded.code,
      });
    }
    const completion = res as OpenAI.Chat.Completions.ChatCompletion;
    if (!completion.choices?.length) {
      throw new Error(`LLM returned no choices: ${JSON.stringify(res).slice(0, 300)}`);
    }
    return completion;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // Current OpenAI models reject max_tokens; other hosts require it.
    // Thinking models spend this budget before emitting text, so a tight cap
    // returns an empty message with finish_reason=length.
    const maxTokens = req.maxTokens ?? Number(process.env.LLM_MAX_TOKENS ?? 8192);
    const body = {
      model: "",
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
      // Non-standard field OpenRouter reads to fail over. Max three entries.
      ...(this.provider === "openrouter" && this.fallbacks.length
        ? { models: [this.model, ...this.fallbacks].slice(0, MAX_ROUTED_MODELS) }
        : {}),
    };

    // OpenRouter fails over server-side; everyone else needs it done here.
    // Gemini's free quota is per model, so a sibling model still has budget.
    const candidates =
      this.provider === "openrouter" ? [this.model] : [this.model, ...this.fallbacks];

    let lastError: unknown;
    let completion: OpenAI.Chat.Completions.ChatCompletion | undefined;

    for (const [index, model] of candidates.entries()) {
      const isLast = index === candidates.length - 1;
      try {
        completion = await withLlmRetry(() => this.createChecked({ ...body, model }), {
          retryRateLimit: isLast,
        });
        if (index > 0) console.warn(`[llm] served by fallback model ${model}`);
        break;
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number }).status;
        if (isLast || (status !== 429 && status !== 404)) throw err;
        console.warn(`[llm] ${model} unavailable (${status}), trying ${candidates[index + 1]}`);
      }
    }
    if (!completion) throw lastError;

    const choice = completion.choices[0];

    const toolCalls: ToolCall[] = [];
    for (const tc of choice.message.tool_calls ?? []) {
      if (tc.type !== "function") continue;
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = { _raw: tc.function.arguments };
      }
      const extra = (tc as unknown as { extra_content?: unknown }).extra_content;
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        input,
        ...(extra ? { providerExtra: { extra_content: extra } } : {}),
      });
    }

    return {
      text: choice.message.content ?? "",
      toolCalls,
      stopReason: STOP_MAP[choice.finish_reason ?? ""] ?? "other",
    };
  }
}
