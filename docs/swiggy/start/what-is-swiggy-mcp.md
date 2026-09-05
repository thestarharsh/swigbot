# What is Swiggy MCP?

> What Swiggy Builders Club offers, who it's for, and when to use it.

Swiggy Builders Club exposes Swiggy's commerce platform as **MCP servers** - the open standard ([Model Context Protocol](https://modelcontextprotocol.io)) that AI agents speak to external tools. One protocol, three servers, 49 tools, zero vendor lock-in.

## The three servers

| Server | Endpoint | What it does | Tools |
| --- | --- | --- | --- |
| **Food** | `mcp.swiggy.com/food` | Restaurant discovery, menus, ordering, tracking | 18 |
| **Instamart** | `mcp.swiggy.com/im` | Quick-commerce grocery                 | 19 |
| **Dineout** | `mcp.swiggy.com/dineout` | Table reservations | 12 |

Each server is independent. Wire one, two, or all three - they don't share carts, orders, or sessions.

## Who it's for

- **Agent developers** building with OpenAI Agents SDK, Anthropic SDK, LangGraph, Vercel AI SDK, Mastra, PydanticAI, CrewAI, or Google ADK. You ship an agent that talks to Swiggy as a tool provider.
- **Agent platforms** running at scale - voice assistants, in-app agents, conversational commerce - that broker Swiggy on behalf of many end users. You need delegated auth and production rate limits.
- **AI-client users** of Claude Desktop, ChatGPT, Cursor, VS Code, or Windsurf who want Swiggy available as a tool inside their existing client. No code - just a config paste.

## When MCP fits (and when it doesn't)

MCP shines when an agent needs to **discover and reason across multiple tools at runtime**. The LLM sees tool schemas, decides which to call, orchestrates multi-step flows like search → menu → cart → checkout. That's Swiggy's sweet spot.

If you're embedding a fixed Swiggy widget into a SaaS product without any agent involvement - a "reorder my last Instamart basket" button - you want Swiggy's regular APIs, not MCP. This site is MCP-only.

## What you get out of the box

- **OAuth 2.1 with PKCE** - the same auth flow Claude Desktop and Cursor use natively.
- **Streamable HTTP transport** - one URL per server, standard JSON-RPC.
- **Session auth** - no passing user credentials as tool arguments.
- **Stable error taxonomy** - [canonical error codes](/docs/reference/errors.md) your code can branch on.
- **Versioning contract** - 6-month deprecation windows (see [versioning](/docs/operate/versioning.md)).

## What you're signing up for

- **India-only user base** - Swiggy serves Indian consumers. No cross-border data flow, no US/EU residency.
- **Whitelist onboarding** - production access is invite-based today; see [Access](/docs/operate/access.md).
- **Partner contract** - SLA, rate limits, data handling described in [Operate](/docs/operate.md). Some clauses are negotiated per-partner.

## Where to go next

- Build your first agent: [Developer quickstart](/docs/start/developer.md).
- Running an agent platform: [Enterprise onboarding](/docs/start/enterprise.md).
- Just want Swiggy in Claude Desktop: [Consumer install](/docs/start/consumer.md).
- Poke at the tool catalogue: [Reference](/docs/reference.md).
