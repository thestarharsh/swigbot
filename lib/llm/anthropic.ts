import Anthropic from "@anthropic-ai/sdk";
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
  end_turn: "end",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
};

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    switch (m.role) {
      case "user":
        return { role: "user", content: m.content };
      case "assistant": {
        const blocks: Anthropic.ContentBlockParam[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls ?? []) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        }
        return { role: "assistant", content: blocks };
      }
      case "tool_results":
        // All results for one assistant turn go back in a single user message.
        return {
          role: "user",
          content: m.results.map(
            (r): Anthropic.ToolResultBlockParam => ({
              type: "tool_result",
              tool_use_id: r.toolCallId,
              content: r.content,
              is_error: r.isError ?? false,
            }),
          ),
        };
    }
  });
}

export class AnthropicChatModel implements ChatModel {
  readonly provider = "anthropic";
  private client: Anthropic;

  constructor(
    readonly model: string,
    apiKey: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const system: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: req.system.stable,
        cache_control: { type: "ephemeral" },
      },
    ];
    if (req.system.dynamic) {
      system.push({ type: "text", text: req.system.dynamic });
    }

    const response = await withLlmRetry(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 4096,
        system,
        tools: req.tools.map(
          (t): Anthropic.Tool => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
          }),
        ),
        messages: toAnthropicMessages(req.messages),
      }),
    );

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls,
      stopReason: STOP_MAP[response.stop_reason ?? ""] ?? "other",
    };
  }
}
