/**
 * Provider-agnostic chat contract. The agent speaks only these types;
 * adapters translate to Anthropic or any OpenAI-compatible endpoint.
 */

export interface ToolDef {
  name: string;
  description?: string;
  /** JSON Schema for the tool input, as discovered from MCP listTools. */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  providerExtra?: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool_results"; results: ToolResult[] };

export interface SystemPrompt {
  /** Large, byte-stable across requests - eligible for provider prompt caching. */
  stable: string;
  /** Per-user/per-turn runtime context; rendered after the cache breakpoint. */
  dynamic: string;
}

export type StopReason = "end" | "tool_use" | "max_tokens" | "other";

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
}

export interface ChatRequest {
  system: SystemPrompt;
  messages: ChatMessage[];
  tools: ToolDef[];
  maxTokens?: number;
}

export interface ChatModel {
  readonly provider: string;
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
