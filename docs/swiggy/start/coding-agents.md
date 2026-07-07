# Coding agents

> Plug Swiggy Builders Club docs into Claude Code, Cursor, Windsurf, and other AI coding tools - so your agent reads authoritative docs before it writes code against Swiggy.

Every page on this site ships in three forms the moment it's published: HTML for you, Markdown for your agent, and a compact index for quick lookup. Point your coding tool at one URL and it has the whole catalog - tool schemas, auth flow, error codes, rate limits - without scraping or guessing.

## Paste this into your coding agent

The fastest way to set up any coding agent - Claude Code, Cursor, Windsurf, Codex, Aider, Cline, or anything that reads project rules. Paste this prompt into your agent (or drop it in `CLAUDE.md` / `.cursor/rules/` / `AGENTS.md`):

```md
You have access to Swiggy Builders Club docs - the authoritative source
for Swiggy MCP (Food, Instamart, Dineout). Always consult these before
writing Swiggy code:

- Index:      https://mcp.swiggy.com/builders/llms.txt
- Full text:  https://mcp.swiggy.com/builders/llms-full.txt
- Per-page:   append `.md` to any https://mcp.swiggy.com/builders/docs/... URL

Tool schemas live under `/docs/reference/{food,instamart,dineout}`.
Error codes live at `/docs/reference/errors`. Auth flow is at
`/docs/start/authenticate`.

Rules:
1. Before recommending a tool name, parameter, error code, rate limit,
   or auth flow, fetch the relevant doc and verify.
2. Never invent tool names or parameters. If the docs don't cover it,
   say so and ask.
3. Prefer `.md` page fetches over `llms-full.txt` when you know the
   exact area - it's cheaper on context.

Smoke test: fetch llms.txt and tell me how many tools the Food server
exposes. (Answer: 14.)
```

That's it. Your agent now reads real docs instead of guessing. Scroll for tool-specific install paths (`CLAUDE.md`, `.cursor/rules/`, `.windsurf/rules/`, `AGENTS.md`), or keep going for the reference section below.

## The docs, as Markdown

Append `.md` to any docs or blog URL:

| URL | Serves |
| --- | --- |
| `https://mcp.swiggy.com/builders/docs/start/authenticate.md` | This page as plain Markdown |
| `https://mcp.swiggy.com/builders/docs/reference/food/search_restaurants.md` | One tool, full schema |
| `https://mcp.swiggy.com/builders/llms.txt` | Compact index: every page, URL, and one-line description |
| `https://mcp.swiggy.com/builders/llms-full.txt` | Every page's full body concatenated - one file, ~all docs |

`llms.txt` follows the [llmstxt.org](https://llmstxt.org) convention. `llms-full.txt` is the "drop the whole docs into a prompt" file - use it when your agent needs breadth without tool calls.

## Wire it into your coding tool

#### Claude Code

Add this to `CLAUDE.md` at the root of your project (or your global `~/.claude/CLAUDE.md`):

```md
## Swiggy Builders Club

When writing code against Swiggy MCP (Food, Instamart, Dineout),
consult the authoritative docs at:

- Index:     https://mcp.swiggy.com/builders/llms.txt
- Full text: https://mcp.swiggy.com/builders/llms-full.txt
- Per-page:  append `.md` to any https://mcp.swiggy.com/builders/docs/... URL

Before recommending a tool name, parameter, error code, rate limit, or
auth flow, verify against these docs. The tool catalog lives under
`/docs/reference/{food,instamart,dineout}`.
```

Claude Code's `WebFetch` tool will pull these on demand. For interactive testing against the live MCP servers, also see [Connect your AI client](/docs/start/consumer/use-in-ai-client.md) - the Claude Desktop config works in Claude Code too.

#### Cursor

Create `.cursor/rules/swiggy.mdc` in your repo (or edit user-level rules):

```md
---
description: Swiggy Builders Club docs
alwaysApply: true
---

Authoritative Swiggy MCP docs:
- https://mcp.swiggy.com/builders/llms.txt (index)
- https://mcp.swiggy.com/builders/llms-full.txt (full)
- Append `.md` to any https://mcp.swiggy.com/builders/docs/... URL

Reference these before writing Swiggy MCP code. The tool catalog is at
/docs/reference/{food,instamart,dineout}. Never invent tool names,
parameters, or error codes - look them up.
```

For live tool access inside Cursor Chat/Composer, add the Swiggy MCP servers via `~/.cursor/mcp.json` - the config lives on the [Connect your AI client](/docs/start/consumer/use-in-ai-client.md) page.

#### Windsurf

Add a workspace rule at `.windsurf/rules/swiggy.md`:

```md
---
trigger: always_on
---

When writing code against Swiggy MCP (Food, Instamart, Dineout), consult:
- https://mcp.swiggy.com/builders/llms.txt
- https://mcp.swiggy.com/builders/llms-full.txt
- Per-page: append `.md` to any /builders/docs/... URL

Do not guess tool names, parameters, error codes, or rate limits -
verify against these docs first.
```

For Cascade tool access, configure the Swiggy MCP servers in `~/.codeium/windsurf/mcp_config.json` - see [Connect your AI client](/docs/start/consumer/use-in-ai-client.md).

#### AGENTS.md

[`AGENTS.md`](https://agents.md) is a tool-agnostic convention - a plain Markdown file at your repo root that most coding agents read (Codex, Aider, Cline, and a growing list). Drop this in:

```md
# AGENTS.md

## External docs - Swiggy Builders Club

This project integrates Swiggy MCP servers. Before writing Swiggy code,
fetch the authoritative docs:

- Index:     https://mcp.swiggy.com/builders/llms.txt
- Full text: https://mcp.swiggy.com/builders/llms-full.txt
- Per-page:  append `.md` to any https://mcp.swiggy.com/builders/docs/... URL

Use `/docs/reference/{food,instamart,dineout}` for tool schemas and
`/docs/operate/errors` for the canonical error taxonomy. Do not invent
tool names or parameters.
```

Any agent that honours `AGENTS.md` (most do today; the list is growing) will surface these links into its context.

#### Any agent / raw

Every resource is plain HTTP, no auth:

| Resource | URL |
| --- | --- |
| Compact index | `https://mcp.swiggy.com/builders/llms.txt` |
| Full-text dump | `https://mcp.swiggy.com/builders/llms-full.txt` |
| Per-page `.md` | `https://mcp.swiggy.com/builders/docs/<path>.md` |

Feed these into your agent's retrieval pipeline, prompt prefix, or tool-call context however your framework allows.

## What a good agent rule looks like

A useful rule points your agent at the docs **and** tells it when to look. Three things worth including:

1. **Where** - the three URLs above.
2. **When** - before suggesting a tool name, parameter, error code, rate limit, or auth flow.
3. **Why not to guess** - Swiggy tool schemas evolve. Hallucinated parameters fail silently in dev and load-bearing in prod.

## Test your agent can read the docs

Ask your coding agent:

> **Note**
>
> *"Fetch https://mcp.swiggy.com/builders/llms.txt and tell me how many tools are under the Food MCP server."*

A correctly-wired agent answers "14" after reading `/docs/reference/food/`. A mis-wired one guesses.

## Connect Swiggy MCP for live tool calls

Rules above give your agent **docs**. If you want your agent to actually **call Swiggy tools** (place test orders, fetch real menus) while you develop, install the Swiggy MCP servers in your IDE - the full config for Cursor, Claude Desktop, VS Code Copilot, Windsurf, and any MCP client is on [Connect your AI client](/docs/start/consumer/use-in-ai-client.md).

> **Note**
>
> Installing Swiggy MCP servers in your IDE runs against **production** Swiggy. Tool calls like `place_food_order` will place real orders on your account. Read [Ship to production](/docs/build/ship-to-production.md) before flipping the switch.

## Where to go next

- New to Swiggy MCP: [What is Swiggy MCP?](/docs/start/what-is-swiggy-mcp.md).
- Building your first agent: [Developer quickstart](/docs/start/developer.md).
- Ready for prod: [Ship to production](/docs/build/ship-to-production.md).
- Tool catalog: [Reference](/docs/reference.md).
