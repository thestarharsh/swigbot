# 🛵 SwigBot

Conversational commerce agent for **Swiggy MCP** (Food, Instamart, Dineout) - order food, groceries, and book tables through natural conversation on **Telegram** or a local **CLI**, with a **BYOK** LLM layer (Anthropic, OpenAI, OpenRouter, Gemini, or any OpenAI-compatible endpoint).

Built against the Swiggy Builders Club v1 spec. The 20 documented failure modes (cart drift, ₹1000 cap, phantom coupons, slot races, non-idempotent placement, …) are handled in the system prompt **and** - for the non-negotiables - enforced in code (`lib/mcp/guardrails.ts`).

## How it works

```
Telegram ──▶ /api/webhook ──┐
                            ├──▶ lib/agent.ts ──▶ lib/llm (BYOK adapter) ──▶ your LLM
CLI (pnpm cli) ─────────────┘         │
                                      ▼
                        lib/mcp (guardrails + retry)
                                      │  Bearer <per-user token>
                                      ▼
                    mcp.swiggy.com  /food  /im  /dineout
```

- **Auth is per end user** (delegated OAuth 2.1 + PKCE). There is **no Swiggy client id/secret** - the app self-registers via Dynamic Client Registration (`POST /auth/register`) on first use. Each user logs in with their own Swiggy phone + OTP; their 5-day token is stored in Postgres. v1 has no refresh tokens: on expiry/401 the bot sends a fresh login link (silent re-auth while the 30-day Swiggy session lives).
- **Capabilities are discovered, not hardcoded** - tools come from MCP `listTools` on each server; if a server is down, its tools simply don't exist that session.
- **No approval needed for local dev** - everything below runs against the real Swiggy staging endpoints from localhost. Apply for production access only when going live (see `docs/swiggy/docs/operate/access.md`).

## Prerequisites

- Node.js 20+, pnpm, Docker (for Postgres), ngrok (only for Telegram)
- A Telegram bot token from [@BotFather](https://core.telegram.org/bots/tutorial) (only for Telegram)
- An API key for one LLM provider

## Setup

```bash
pnpm install
cp .env.example .env.local        # then fill in the values

docker compose up -d              # Postgres 16 on localhost:5433
pnpm db:push                      # create tables
```

Minimal `.env.local` for CLI-only dev:

```env
LLM_PROVIDER=anthropic            # or openai | openrouter | gemini | custom
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://swigbot:swigbot@localhost:5433/swigbot
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Run - CLI (fastest loop, no ngrok)

```bash
pnpm dev          # terminal 1 - serves the OAuth callback on :3000
pnpm cli          # terminal 2 - chat REPL
```

First message returns a Swiggy login link → open it, enter phone + OTP → chat. The browser and the app both run on your machine, so `http://localhost:3000` redirect URIs work out of the box.

## Run - Telegram

```bash
pnpm dev                          # terminal 1
ngrok http 3000                   # terminal 2 → copy the https URL
```

Set in `.env.local`: `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET` (any random string), and `NEXT_PUBLIC_APP_URL=https://<your-ngrok>.ngrok.io` - the OAuth redirect URI is derived from it, and the app re-runs DCR automatically when it changes. Restart `pnpm dev`, then:

```bash
pnpm webhook:set                  # registers the webhook with Telegram
```

Message your bot. `/logout` unlinks the Swiggy account.

## Tests

```bash
pnpm test         # guardrail behaviors: cap/minimum blocks, check-then-retry,
                  # track cooldown, phantom-coupon scrub, COD coupon filter,
                  # error classification, backoff policy
pnpm typecheck
```

## Layout

| Path | What |
|---|---|
| `lib/agent.ts` | Turn loop: auth pre-flight → LLM ⇄ tools → reply; history in Postgres |
| `lib/prompt.ts` | SwigBot system prompt (cache-stable core + per-user runtime context) |
| `lib/llm/` | Provider-agnostic chat: native Anthropic adapter + OpenAI-compat adapter (covers OpenAI/OpenRouter/Gemini/custom) |
| `lib/mcp/session.ts` | MCP client per user token: 3 servers, tool discovery, deprecation watch |
| `lib/mcp/guardrails.ts` | Code-level enforcement: ₹1000 cap, ₹99 min, no blind retry of placement (check-then-retry), 10s track cooldown, coupon scrubbing/filtering, tool-call log |
| `lib/mcp/retry.ts` | Backoff 500ms→8s, ≤5 attempts, 30s wall-clock budget |
| `lib/swiggy-auth.ts` | DCR + per-user PKCE + token storage/logout |
| `app/api/webhook` | Telegram webhook (instant ack, async processing, secret check, dedupe) |
| `app/api/auth/callback/swiggy` | OAuth redirect handler (+ Telegram notification) |
| `scripts/cli-chat.ts` | Local REPL surface |
| `docs/swiggy/` | Vendored Swiggy Builders Club docs (auth, flows, all 35 tool references) |

## Design notes & caveats

- **Numeric guardrails are best-effort**: Swiggy's docs don't publish full response schemas, so cart totals are found by tolerant key matching (`bill_total`, `grandTotal`, `total_to_pay`, …). A confident violation hard-blocks placement; anything ambiguous falls through to the prompt-level rules, which the model follows from real response values.
- **Order placement is never blind-retried.** On an ambiguous 5xx the wrapper waits, calls `get_food_orders`/`get_orders`/`get_booking_status`, and hands the model both facts with explicit instructions (per the ship-to-production doc).
- **Telegram is webhook-only** with plain `fetch` - no `node-telegram-bot-api` (that library is long-polling-oriented).
- **Rate limits**: none enforced by Swiggy MCP in v1.0; the bot still keeps `track_*` ≥10s apart and caches MCP sessions/addresses per turn.
- **Cancellations** have no tool by design - the bot gives Swiggy care: **080-67466729**.
