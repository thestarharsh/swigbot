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

- Node.js 20+, pnpm
- A Postgres database - a [Neon](https://console.neon.tech) free-tier project is enough
- A Telegram bot token from [@BotFather](https://core.telegram.org/bots/tutorial) (only for Telegram)
- An API key for one LLM provider

## Setup

```bash
pnpm install
cp .env.example .env.local        # then fill in the values
pnpm db:push                      # create tables
```

Minimal `.env.local` for CLI-only dev:

```env
LLM_PROVIDER=anthropic            # or openai | openrouter | gemini | custom
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Database

**Neon (recommended)** - data survives laptop reboots and is the same database the deployed app reads. Create a project in the [Neon console](https://console.neon.tech), copy the **direct** connection string (host without `-pooler`), set both `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, then `pnpm db:push`. TLS is enabled automatically for any non-localhost host.

Use the direct endpoint, not the pooled one. Neon's pooler shares server connections between clients, so session state leaks: piping a `pg_dump` through it (dumps emit `set_config('search_path','')`) leaves `search_path` empty for every later client, and unqualified queries then fail with `relation "users" does not exist`. It also rejects `options=-c search_path=public`, and Drizzle refuses to schema-qualify against `public`, so there is no client-side defence. A direct connection has none of these problems, and this workload opens very few connections.

`pnpm db:reset --yes` truncates every table for a clean demo run. It deletes linked Swiggy tokens too, so users re-do phone + OTP afterwards.

Verify the provider before chatting - `pnpm probe` runs a plain completion plus a two-round tool loop against the configured model, and fails loudly if the model can't call tools:

```bash
pnpm probe
```

Free tiers run out. `LLM_MODEL_FALLBACKS` takes a comma-separated list of models to fall back to when the primary is rate limited (429) or gone (404). OpenRouter does this server-side via its `models` field, so failover costs no extra request but accepts only two fallbacks beyond the primary; every other provider falls through the list client-side.

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
LLM_MODEL=poolside/laguna-s-2.1:free
LLM_MODEL_FALLBACKS=nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free
```

Free-tier quotas worth knowing, measured rather than guessed:

| Provider | Limit | Notes |
|---|---|---|
| OpenRouter free models | 50 requests/day per **account**, resets 00:00 UTC | $10 of credit raises it to 1000/day |
| Gemini free tier | 20 requests/day per **model** | Per-model, so a fallback chain multiplies the budget |

A turn costs 3-12 requests, so a 50/day account is roughly 6 turns. Budget accordingly before a live demo.

Two Gemini-specific quirks the adapter handles, both of which look like bugs elsewhere:

- **Thought signatures.** Gemini 3 returns an opaque `thought_signature` with each function call and rejects the next turn if it is not echoed back. It rides along in `ToolCall.providerExtra`, is persisted with history, and is replayed verbatim.
- **Thinking eats the output budget.** A low `max_tokens` returns an empty message with `finish_reason=length`, because reasoning is billed against the same budget. The default is 8192; override with `LLM_MAX_TOKENS`.
- Pinned `gemini-2.5-*` model IDs are refused for keys created after their retirement; prefer the `gemini-flash-latest` style aliases.

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

Set in `.env.local`: `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET` (any random string), and `NEXT_PUBLIC_APP_URL=https://<your-ngrok>.ngrok.io`. Restart `pnpm dev`, then:

```bash
pnpm webhook:set                  # registers the webhook with Telegram
```

Message your bot. `/logout` unlinks the Swiggy account.

**Keep the OAuth redirect on localhost.** Swiggy allowlists redirect URIs by exact match and accepts only HTTPS or `http://localhost`, so a tunnel hostname is refused at `/authorize` with "isn't whitelisted yet". The two URLs are configured separately - Telegram posts to the tunnel, the browser lands on localhost:

```env
NEXT_PUBLIC_APP_URL=https://<your-ngrok>.ngrok-free.app   # webhook target
SWIGGY_REDIRECT_BASE_URL=http://localhost:3000            # OAuth redirect_uri
```

Consequence: open the login link on the machine running the app (Telegram Desktop or web, not a phone) - `localhost` resolves only there. The app re-runs DCR automatically when the redirect URI changes. A production redirect URI has to be registered with Swiggy via builders@swiggy.in.

## Deploy to Vercel

Vercel replaces ngrok as the webhook host. It cannot yet host the OAuth redirect: Swiggy's `/auth` page rejects any hostname that is not an allowlisted client, and `*.vercel.app` renders "Oops, Vercel isn't whitelisted yet". Request allowlisting for your production URL via an issue on [Swiggy/swiggy-mcp-server-manifest](https://github.com/Swiggy/swiggy-mcp-server-manifest).

Until then the two roles split, which is why the database has to be hosted rather than local - both processes share it:

| Role | URL | Runs on |
|---|---|---|
| Telegram webhook | `https://<app>.vercel.app/api/webhook` | Vercel |
| OAuth redirect | `http://localhost:3000/api/auth/callback/swiggy` | your machine, during login only |

```bash
pnpm dlx vercel            # link and deploy
pnpm dlx vercel --prod
```

Set these in Vercel's project settings (Environment Variables), then redeploy:

```env
DATABASE_URL=<Neon DIRECT connection string>
TELEGRAM_BOT_TOKEN=...
WEBHOOK_SECRET=...
LLM_PROVIDER=...
OPENROUTER_API_KEY=...          # or whichever provider key
NEXT_PUBLIC_APP_URL=https://<app>.vercel.app
SWIGGY_REDIRECT_BASE_URL=http://localhost:3000
```

Point Telegram at the deployment (locally, with `NEXT_PUBLIC_APP_URL` set to the Vercel URL):

```bash
pnpm webhook:set
```

Serverless notes:

- **Update dedupe is in Postgres**, not memory - instances share nothing, and Telegram redelivers on a slow ack.
- **`maxDuration = 60`** on the webhook route. A turn makes several LLM and MCP calls; slow free-tier models can exceed the limit on your plan, and the reply is then lost.
- **The MCP session cache is per instance**, so cold starts reconnect to all three servers (roughly a second).
- **`DB_POOL_MAX` defaults to 1 on Vercel**, so many instances don't exhaust Neon's connection limit on the direct endpoint.

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
| `lib/mcp/guardrails.ts` | Code-level enforcement: confirmation gate on irreversible calls, required-arg validation, ₹1000 cap, ₹99 min, no blind retry of placement (check-then-retry), 10s track cooldown, coupon scrubbing/filtering, tool-call log |
| `lib/mcp/retry.ts` | Backoff 500ms→8s, ≤5 attempts, 30s wall-clock budget |
| `lib/llm/backoff.ts` | Retries transient provider failures (429/5xx, honours `Retry-After`) so a saturated free tier doesn't kill a turn |
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
