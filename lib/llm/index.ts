import { AnthropicChatModel } from "./anthropic";
import { OpenAiCompatChatModel } from "./openai-compat";
import type { ChatModel } from "./types";

export * from "./types";

interface ProviderPreset {
  baseURL?: string;
  keyEnv: string;
  defaultModel: string;
}

const PRESETS: Record<string, ProviderPreset> = {
  anthropic: { keyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-opus-4-8" },
  openai: { keyEnv: "OPENAI_API_KEY", defaultModel: "gpt-5.2" },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-sonnet-5",
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-pro",
  },
  custom: { keyEnv: "LLM_API_KEY", defaultModel: "" },
};

/**
 * LLM_PROVIDER picks the adapter. Provider-specific keys win over LLM_API_KEY;
 * LLM_MODEL and LLM_BASE_URL override the preset defaults.
 */
export function getChatModel(): ChatModel {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  const preset = PRESETS[provider];
  if (!preset) {
    throw new Error(
      `Unknown LLM_PROVIDER "${provider}". Use one of: ${Object.keys(PRESETS).join(", ")}`,
    );
  }

  const apiKey = process.env[preset.keyEnv] || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${provider}" - set ${preset.keyEnv} (or LLM_API_KEY)`,
    );
  }

  const model = process.env.LLM_MODEL || preset.defaultModel;
  if (!model) {
    throw new Error(`Set LLM_MODEL for provider "${provider}"`);
  }

  if (provider === "anthropic") {
    return new AnthropicChatModel(model, apiKey);
  }

  const baseURL = process.env.LLM_BASE_URL || preset.baseURL;
  if (provider === "custom" && !baseURL) {
    throw new Error(`Set LLM_BASE_URL for provider "custom"`);
  }

  const fallbacks = (process.env.LLM_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== model);

  return new OpenAiCompatChatModel(provider, model, apiKey, baseURL, fallbacks);
}
