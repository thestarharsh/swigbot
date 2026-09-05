import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pkg from "../../package.json";
import { SWIGGY_SERVERS, swiggyBaseUrl, type ServerKey } from "../swiggy-config";
import type { ToolDef } from "../llm/types";
import { SwiggyAuthError, isAuthError, messageOf } from "./errors";

export type { ServerKey };

export interface ToolCallOutcome {
  /** Concatenated text content, handed to the LLM verbatim (post-guardrails). */
  text: string;
  isError: boolean;
}

/**
 * One authenticated user's view of the three Swiggy MCP servers. Calls
 * dispatch by tool name; a server that fails to connect simply contributes no
 * tools this session.
 */
export class SwiggyMcpSession {
  private clients = new Map<ServerKey, Client>();
  private toolIndex = new Map<string, ServerKey>();
  tools: ToolDef[] = [];

  private constructor() {}

  static async connect(token: string): Promise<SwiggyMcpSession> {
    const session = new SwiggyMcpSession();
    let authFailure: unknown = null;

    const connected = await Promise.all(
      SWIGGY_SERVERS.map(async ({ key, path }) => {
        try {
          const client = new Client({ name: "swigbot", version: pkg.version });
          const transport = new StreamableHTTPClientTransport(
            new URL(`${swiggyBaseUrl()}${path}`),
            { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
          );
          await client.connect(transport);
          const { tools } = await client.listTools();
          return { key, client, tools };
        } catch (err) {
          if (isAuthError(err)) authFailure = err;
          console.warn(`[mcp] ${key} server unavailable:`, messageOf(err));
          return null;
        }
      }),
    );

    // Names are not unique across servers - report_error exists on all three
    // and get_addresses on two - so registration follows the fixed SERVERS
    // order rather than whichever connection happened to finish first.
    for (const entry of connected) {
      if (!entry) continue;
      session.clients.set(entry.key, entry.client);
      for (const t of entry.tools) {
        if (session.toolIndex.has(t.name)) continue;
        session.toolIndex.set(t.name, entry.key);
        session.tools.push({
          name: t.name,
          description: t.description,
          inputSchema: (t.inputSchema ?? { type: "object" }) as Record<string, unknown>,
        });
      }
    }

    // Every server rejecting the token means the Swiggy session is dead.
    if (session.clients.size === 0 && authFailure) {
      throw new SwiggyAuthError();
    }
    return session;
  }

  serverFor(toolName: string): ServerKey | undefined {
    return this.toolIndex.get(toolName);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome> {
    const serverKey = this.toolIndex.get(name);
    const client = serverKey && this.clients.get(serverKey);
    if (!client) {
      return { text: `Tool "${name}" is not available right now.`, isError: true };
    }

    try {
      const result = await client.callTool({ name, arguments: args });
      checkDeprecation(name, result);
      return { text: contentToText(result.content), isError: result.isError === true };
    } catch (err) {
      if (isAuthError(err)) throw new SwiggyAuthError();
      throw err;
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.close().catch(() => {})));
    this.clients.clear();
  }
}

/** _meta.swiggy.deprecation starts populating in v1.1. */
export function checkDeprecation(tool: string, result: unknown): void {
  const meta = (result as { _meta?: { swiggy?: { deprecation?: unknown } } })?._meta;
  const dep = meta?.swiggy?.deprecation;
  if (dep) {
    console.warn(`[mcp] DEPRECATION notice for tool "${tool}":`, JSON.stringify(dep));
  }
}

export function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .map((block) => {
      if (block && typeof block === "object" && "type" in block) {
        if (block.type === "text" && "text" in block) return String(block.text);
        return `[${String(block.type)} content]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

// Session cache: avoids reconnecting to 3 servers on every message.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { session: SwiggyMcpSession; ts: number }>();

export async function getMcpSession(token: string): Promise<SwiggyMcpSession> {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.session;
  if (hit) {
    cache.delete(token);
    void hit.session.close();
  }
  const session = await SwiggyMcpSession.connect(token);
  cache.set(token, { session, ts: Date.now() });
  return session;
}

export function evictMcpSession(token: string): void {
  const hit = cache.get(token);
  if (hit) {
    cache.delete(token);
    void hit.session.close();
  }
}
