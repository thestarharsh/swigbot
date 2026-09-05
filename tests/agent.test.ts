import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn, truncateToolResult, type AgentDeps } from "../lib/agent";
import type { ChatMessage, ChatResponse, ToolDef } from "../lib/llm/types";
import type { schema } from "../lib/db";
import { SwiggyAuthError } from "../lib/mcp/errors";
import type { SwiggyMcpSession, ToolCallOutcome } from "../lib/mcp/session";

type User = typeof schema.users.$inferSelect;

const USER: User = {
  id: 7,
  platform: "cli",
  platformUserId: "local",
  name: "Ada",
  createdAt: new Date(),
};

const reply = (text: string, over = {}): ChatResponse => ({
  text,
  toolCalls: [],
  stopReason: "end",
  ...over,
});

const callFor = (name: string, input: Record<string, unknown> = {}) => ({
  id: `c-${Math.random().toString(36).slice(2, 7)}`,
  name,
  input,
});

interface Harness {
  deps: Partial<AgentDeps>;
  persisted: ChatMessage[];
  tools: { name: string; input: Record<string, unknown> }[];
  invalidated: number[];
  released: number[];
}

function harness(
  responses: (ChatResponse | (() => ChatResponse))[],
  toolOutcome: (name: string) => ToolCallOutcome | Promise<ToolCallOutcome> = () => ({
    text: "{}",
    isError: false,
  }),
  over: Partial<AgentDeps> = {},
): Harness {
  const persisted: ChatMessage[] = [];
  const tools: { name: string; input: Record<string, unknown> }[] = [];
  const invalidated: number[] = [];
  const released: number[] = [];
  let i = 0;

  const session = { tools: [] as ToolDef[] } as unknown as SwiggyMcpSession;

  const deps: Partial<AgentDeps> = {
    getValidToken: async () => "tok",
    invalidateToken: async (id) => {
      invalidated.push(id);
    },
    getSession: async () => session,
    evictSession: () => {},
    getModel: () => ({
      provider: "test",
      model: "test",
      chat: async () => {
        const next = responses[Math.min(i++, responses.length - 1)];
        return typeof next === "function" ? next() : next;
      },
    }),
    loadHistory: async () => [],
    persist: async (_id, message) => {
      persisted.push(message);
    },
    authLink: async () => "LOGIN_LINK",
    acquireTurnLock: async () => true,
    releaseTurnLock: async (id) => {
      released.push(id);
    },
    executeTool: (async (_s, _u, name, input) => {
      tools.push({ name, input });
      return toolOutcome(name);
    }) as AgentDeps["executeTool"],
    ...over,
  };

  return { deps, persisted, tools, invalidated, released };
}

describe("runAgentTurn", () => {
  it("returns the model's text when it emits no tool calls", async () => {
    const h = harness([reply("Two biryanis, coming up.")]);
    await expect(runAgentTurn(USER, "cli", "hi", h.deps)).resolves.toBe("Two biryanis, coming up.");
    expect(h.persisted.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(h.released).toEqual([USER.id]);
  });

  it("executes a tool call and feeds the result back to the model", async () => {
    const h = harness(
      [
        reply("", { toolCalls: [callFor("get_addresses")], stopReason: "tool_use" }),
        reply("You're at Home."),
      ],
      () => ({ text: '{"addresses":[{"label":"Home"}]}', isError: false }),
    );
    await expect(runAgentTurn(USER, "cli", "where do I live", h.deps)).resolves.toBe(
      "You're at Home.",
    );
    expect(h.tools.map((t) => t.name)).toEqual(["get_addresses"]);
    const results = h.persisted.find((m) => m.role === "tool_results");
    expect(results?.role === "tool_results" && results.results[0].content).toContain("Home");
  });

  it("refuses the third identical call without sending it to Swiggy", async () => {
    const call = callFor("search_menu", { query: "biryani" });
    const h = harness([reply("", { toolCalls: [call], stopReason: "tool_use" })]);
    await runAgentTurn(USER, "cli", "biryani", h.deps);
    // Twelve iterations, but only the first two reach the tool.
    expect(h.tools).toHaveLength(2);
    const last = h.persisted.filter((m) => m.role === "tool_results").at(-1);
    expect(last?.role === "tool_results" && last.results[0].content).toContain(
      "already called search_menu",
    );
  });

  it("stops at the iteration cap with a safe message", async () => {
    const h = harness([
      () => reply("", { toolCalls: [callFor("search_menu")], stopReason: "tool_use" }),
    ]);
    const out = await runAgentTurn(USER, "cli", "keep going", h.deps);
    expect(out).toContain("more steps than expected");
  });

  it("turns a mid-loop SwiggyAuthError into a fresh login link", async () => {
    const h = harness(
      [reply("", { toolCalls: [callFor("get_food_cart")], stopReason: "tool_use" })],
      () => {
        throw new SwiggyAuthError();
      },
    );
    const out = await runAgentTurn(USER, "cli", "my cart", h.deps);
    expect(out).toContain("session expired");
    expect(out).toContain("LOGIN_LINK");
    expect(h.invalidated).toEqual([USER.id]);
  });

  it("truncates an oversized tool result before it reaches the model", async () => {
    const huge = "x".repeat(20_000);
    const h = harness(
      [
        reply("", { toolCalls: [callFor("get_restaurant_menu")], stopReason: "tool_use" }),
        reply("done"),
      ],
      () => ({ text: huge, isError: false }),
    );
    await runAgentTurn(USER, "cli", "menu", h.deps);
    const results = h.persisted.find((m) => m.role === "tool_results");
    const content = results?.role === "tool_results" ? results.results[0].content : "";
    expect(content.length).toBeLessThan(huge.length);
    expect(content).toContain("truncated");
  });

  it("flags a reply the model ran out of room for", async () => {
    const h = harness([reply("Here are the first five", { stopReason: "max_tokens" })]);
    const out = await runAgentTurn(USER, "cli", "list everything", h.deps);
    expect(out).toContain('Say "continue" for the rest.');
  });

  it("sends the login link when no Swiggy token is stored, without taking the lock", async () => {
    const h = harness([reply("never reached")], undefined, { getValidToken: async () => null });
    await expect(runAgentTurn(USER, "cli", "hi", h.deps)).resolves.toBe("LOGIN_LINK");
    expect(h.released).toEqual([]);
  });

  it("says it is busy, and persists nothing, while another turn holds the lock", async () => {
    const h = harness([reply("never reached")], undefined, { acquireTurnLock: async () => false });
    await expect(runAgentTurn(USER, "cli", "and a coke", h.deps)).resolves.toBe(
      "Still working on your last message, give me a moment.",
    );
    expect(h.persisted).toEqual([]);
    expect(h.tools).toEqual([]);
  });

  it("releases the lock even when the turn throws outright", async () => {
    const h = harness([reply("boom")], undefined, {
      getModel: () => {
        throw new Error("no api key");
      },
    });
    // The loop's own catch turns this into an apology, but the lock still goes.
    await expect(runAgentTurn(USER, "cli", "hi", h.deps)).rejects.toThrow("no api key");
    expect(h.released).toEqual([USER.id]);
  });
});

describe("truncateToolResult", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("drops trailing array elements so the JSON still parses", () => {
    const payload = {
      restaurant: "Meghana Foods",
      items: Array.from({ length: 400 }, (_, i) => ({ id: i, name: `Dish ${i}`, price: 200 + i })),
    };
    const out = truncateToolResult(JSON.stringify(payload), 2_000);
    expect(out.length).toBeLessThanOrEqual(2_000);
    const parsed = JSON.parse(out) as {
      restaurant: string;
      items: unknown[];
      _truncated_note: string;
    };
    expect(parsed.restaurant).toBe("Meghana Foods");
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items.length).toBeLessThan(400);
    expect(parsed._truncated_note).toContain("omitted");
  });

  it("falls back to a plain slice for text that is not JSON", () => {
    const out = truncateToolResult("y".repeat(5_000), 1_000);
    expect(out.startsWith("y".repeat(1_000))).toBe(true);
    expect(out).toContain("truncated - ask for a narrower query");
  });

  it("leaves anything under the cap byte-identical", () => {
    expect(truncateToolResult('{"a":1}', 1_000)).toBe('{"a":1}');
  });
});
