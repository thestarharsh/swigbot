import { afterEach, describe, expect, it, vi } from "vitest";
import { getChatModel } from "../lib/llm";

const PROVIDER_KEYS = [
  "LLM_PROVIDER",
  "LLM_MODEL",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL_FALLBACKS",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

function env(vars: Record<string, string>) {
  for (const key of PROVIDER_KEYS) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
}

describe("getChatModel presets", () => {
  it("resolves groq to the OpenAI-compatible adapter with its default model", () => {
    env({ LLM_PROVIDER: "groq", GROQ_API_KEY: "gsk_test" });
    const model = getChatModel();
    expect(model.provider).toBe("groq");
    expect(model.model).toBe("openai/gpt-oss-120b");
  });

  it("lets LLM_MODEL override the groq default", () => {
    env({ LLM_PROVIDER: "groq", GROQ_API_KEY: "gsk_test", LLM_MODEL: "llama-3.3-70b-versatile" });
    expect(getChatModel().model).toBe("llama-3.3-70b-versatile");
  });

  it("names the missing key for groq", () => {
    env({ LLM_PROVIDER: "groq" });
    expect(() => getChatModel()).toThrow("GROQ_API_KEY");
  });

  it("accepts the generic LLM_API_KEY for any preset", () => {
    env({ LLM_PROVIDER: "groq", LLM_API_KEY: "gsk_generic" });
    expect(getChatModel().provider).toBe("groq");
  });

  it("resolves mistral to the OpenAI-compatible adapter with its default model", () => {
    env({ LLM_PROVIDER: "mistral", MISTRAL_API_KEY: "test" });
    const model = getChatModel();
    expect(model.provider).toBe("mistral");
    expect(model.model).toBe("ministral-14b-latest");
  });

  it("names the missing key for mistral", () => {
    env({ LLM_PROVIDER: "mistral" });
    expect(() => getChatModel()).toThrow("MISTRAL_API_KEY");
  });

  it("lists every preset in the unknown-provider error", () => {
    env({ LLM_PROVIDER: "copilot" });
    expect(() => getChatModel()).toThrow(
      /anthropic, openai, openrouter, gemini, groq, mistral, custom/,
    );
  });
});
