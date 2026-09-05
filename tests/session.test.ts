import { describe, expect, it, vi } from "vitest";

/** Tools per server path, deliberately overlapping the way Swiggy's do. */
const TOOLS: Record<string, { name: string }[]> = {
  "/food": [{ name: "search_restaurants" }, { name: "get_addresses" }, { name: "report_error" }],
  "/im": [{ name: "search_products" }, { name: "get_addresses" }, { name: "report_error" }],
  "/dineout": [{ name: "book_table" }, { name: "report_error" }],
};

/** Dineout answers first, so a first-past-the-post registration would lose. */
const CONNECT_DELAY_MS: Record<string, number> = { "/food": 12, "/im": 6, "/dineout": 0 };

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    constructor(readonly url: URL) {}
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    private path = "";
    async connect(transport: { url: URL }) {
      this.path = transport.url.pathname;
      await new Promise((r) => setTimeout(r, CONNECT_DELAY_MS[this.path] ?? 0));
    }
    async listTools() {
      return { tools: TOOLS[this.path] ?? [] };
    }
    async close() {}
  },
}));

import { SwiggyMcpSession, checkDeprecation, contentToText } from "../lib/mcp/session";

describe("contentToText", () => {
  it("concatenates text blocks", () => {
    expect(
      contentToText([
        { type: "text", text: "line one" },
        { type: "text", text: "line two" },
      ]),
    ).toBe("line one\nline two");
  });

  it("names non-text blocks instead of dropping them silently", () => {
    expect(
      contentToText([
        { type: "image", data: "…" },
        { type: "text", text: "caption" },
      ]),
    ).toBe("[image content]\ncaption");
  });

  it("passes a bare string through and yields empty for anything else", () => {
    expect(contentToText("plain")).toBe("plain");
    expect(contentToText(undefined)).toBe("");
    expect(contentToText(42)).toBe("");
    expect(contentToText([])).toBe("");
  });
});

describe("checkDeprecation", () => {
  it("warns when _meta.swiggy.deprecation is present", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkDeprecation("get_food_cart", {
      _meta: { swiggy: { deprecation: { sunset: "2026-01-01" } } },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("DEPRECATION"),
      expect.stringContaining("2026-01-01"),
    );
    warn.mockRestore();
  });

  it("stays quiet on an ordinary result", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkDeprecation("get_food_cart", { _meta: {} });
    checkDeprecation("get_food_cart", undefined);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("tool registration order", () => {
  it("routes duplicate names by the fixed food → instamart → dineout order", async () => {
    const session = await SwiggyMcpSession.connect("tok");
    // Both would otherwise land on dineout, whose connection finishes first.
    expect(session.serverFor("report_error")).toBe("food");
    expect(session.serverFor("get_addresses")).toBe("food");
    expect(session.serverFor("search_products")).toBe("instamart");
    expect(session.serverFor("book_table")).toBe("dineout");
  });

  it("registers each name once, in server order", async () => {
    const session = await SwiggyMcpSession.connect("tok");
    expect(session.tools.map((t) => t.name)).toEqual([
      "search_restaurants",
      "get_addresses",
      "report_error",
      "search_products",
      "book_table",
    ]);
  });

  it("gives every tool a schema even when the server omits one", async () => {
    const session = await SwiggyMcpSession.connect("tok");
    expect(session.tools.every((t) => t.inputSchema)).toBe(true);
  });
});
