# 🛵 SwigBot

Conversational commerce agent for **Swiggy MCP** (Food, Instamart, Dineout) - order food, groceries, and book tables through natural conversation on **Telegram** or a local **CLI**, with a **BYOK** LLM layer (Anthropic, OpenAI, OpenRouter, Gemini, or any OpenAI-compatible endpoint).

Built against the Swiggy Builders Club v1 spec. The 21 documented failure modes (cart drift, ₹1000 cap, phantom coupons, slot races, non-idempotent placement, unpaid `PENDING_PAYMENT` orders, …) are handled in the system prompt **and** - for the non-negotiables - enforced in code (`lib/mcp/guardrails.ts`).

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
- **Capabilities are discovered, not hardcoded** - tools come from MCP `listTools` on each server (51 across the three today); if a server is down, its tools simply don't exist that session.
- **No approval needed for local dev** - everything below runs against the real Swiggy staging endpoints from localhost. Apply for production access only when going live (see `docs/swiggy/operate/access.md`).

## Prerequisites

- Node.js 22+ (24 recommended), pnpm
- A Postgres database - a [Neon](https://console.neon.tech) free-tier project is enough
- A Telegram bot token from [@BotFather](https://core.telegram.org/bots/tutorial) (only for Telegram)
- An API key for one LLM provider

## Setup

```bash
pnpm install
cp .env.example .env.local        # then fill in the values
pnpm db:push                      # create tables
pnpm docs:sync                    # optional: re-vendor docs/swiggy/ from mcp.swiggy.com
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

| Provider               | Limit                                             | Notes                                                |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| OpenRouter free models | 50 requests/day per **account**, resets 00:00 UTC | $10 of credit raises it to 1000/day                  |
| Gemini free tier       | 20 requests/day per **model**                     | Per-model, so a fallback chain multiplies the budget |

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

Set in `.env.local`: `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET` (**required** - any random string, e.g. `openssl rand -hex 24`), and `NEXT_PUBLIC_APP_URL=https://<your-ngrok>.ngrok.io`. Restart `pnpm dev`, then:

```bash
pnpm webhook:set                  # registers the webhook with Telegram
```

Message your bot. `/logout` unlinks the Swiggy account.

Messages go out as **plain text**, not Markdown, so bare URLs auto-link and underscores survive - that is what keeps both the OAuth login link and the UPI `bridgeUrl` (which carries a query string) intact.

**Keep the OAuth redirect on localhost.** Swiggy allowlists redirect URIs by exact match and accepts only HTTPS or `http://localhost`, so a tunnel hostname is refused at `/authorize` with "isn't whitelisted yet". The two URLs are configured separately - Telegram posts to the tunnel, the browser lands on localhost:

```env
NEXT_PUBLIC_APP_URL=https://<your-ngrok>.ngrok-free.app   # webhook target
SWIGGY_REDIRECT_BASE_URL=http://localhost:3000            # OAuth redirect_uri
```

Consequence: open the login link on the machine running the app (Telegram Desktop or web, not a phone) - `localhost` resolves only there. The app re-runs DCR automatically when the redirect URI changes. A production redirect URI has to be registered with Swiggy via builders@swiggy.in.

## Deploy to Vercel

Vercel replaces ngrok as the webhook host. It cannot yet host the OAuth redirect: Swiggy's `/auth` page rejects any hostname that is not an allowlisted client, and `*.vercel.app` renders "Oops, Vercel isn't whitelisted yet". Request allowlisting for your production URL via an issue on [Swiggy/swiggy-mcp-server-manifest](https://github.com/Swiggy/swiggy-mcp-server-manifest).

Until then the two roles split, which is why the database has to be hosted rather than local - both processes share it:

| Role             | URL                                              | Runs on                         |
| ---------------- | ------------------------------------------------ | ------------------------------- |
| Telegram webhook | `https://<app>.vercel.app/api/webhook`           | Vercel                          |
| OAuth redirect   | `http://localhost:3000/api/auth/callback/swiggy` | your machine, during login only |

```bash
pnpm dlx vercel            # link and deploy
pnpm dlx vercel --prod
```

Set these in Vercel's project settings (Environment Variables), then redeploy:

```env
DATABASE_URL=<Neon DIRECT connection string>
TELEGRAM_BOT_TOKEN=...
WEBHOOK_SECRET=...                # required: the route refuses to start without it
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

- **Update dedupe is in Postgres**, not memory - instances share nothing, and Telegram redelivers on a slow ack. So is the **per-user turn lock** (`turn_locks`, 90s TTL): two messages from one chat land on two instances, and interleaved turns would fight over a single server-side cart. The second gets "still working on your last message".
- **`WEBHOOK_SECRET` is mandatory in production.** The route throws at module load without it, and `pnpm webhook:set` refuses to register an unprotected endpoint.
- **`maxDuration = 60`** on the webhook route. A turn makes several LLM and MCP calls; slow free-tier models can exceed the limit on your plan, and the reply is then lost.
- **The MCP session cache is per instance**, so cold starts reconnect to all three servers (roughly a second).
- **`DB_POOL_MAX` defaults to 1 on Vercel**, so many instances don't exhaust Neon's connection limit on the direct endpoint.

## Payments

Orders settle over **UPI, in chat**. There is no polling loop, and no QR is ever rendered here.

1. The user confirms the order. The bot calls `get_payment_options` and reads back at most three of `data.allMethods` by display name, plus Cash when `data.cod.available`. It never asks for a UPI ID (NPCI forbids it) and never asks what device you're on.
2. The pick goes straight into the placement tool - `intentApp` for a UPI app, `generateUPIQR` for scan-QR, `paymentMethod: "Cash"` for COD.
3. A UPI placement comes back `PENDING_PAYMENT`: the order is **reserved, not placed**. The bot sends the response's `bridgeUrl` bare on its own line - an https page that both opens your UPI app and shows a scannable QR - and asks you to reply "paid".
4. On that next message it calls `check_payment_status` **once**, then `confirm_order` if the payment succeeded but wasn't auto-confirmed. `failed` re-offers the picker; `cancelled` and `refund-initiated` stop; `cart_changed` shows the cart again.

**Why no poll loop.** `check_payment_status` is a long poll - Swiggy holds the connection ~19s - and the Telegram webhook has `maxDuration = 60`. One loop iteration can eat a third of the turn budget for a "still pending", so the flow is driven by the user across turns instead. `check_payment_status` shares the 10s cooldown with the tracking tools, enforced from `tool_call_log`.

`confirm_order` is documented idempotent and never places an unpaid order, so unlike placement it _is_ retried on a 5xx. It carries no separate consent gate - you consented when you confirmed the order and then paid with your own hands - but it runs at most once per order per turn.

## Tests

```bash
pnpm test         # guardrail behaviors: cap/minimum blocks, confirmation gate,
                  # duplicate-placement latch, check-then-retry, the 10s
                  # cooldown on tracking/delivery/payment reads, the
                  # once-per-order confirm_order latch, the PENDING_PAYMENT
                  # note, create_address coordinate stripping, phantom-coupon
                  # scrub, paid-slot filter, required-arg validation, plus the
                  # agent turn loop, the system prompt, the docs sync helpers,
                  # the Telegram webhook, the OAuth/PKCE flow, MCP session
                  # wiring, provider message mapping, error classification and
                  # backoff policy
pnpm lint
pnpm format:check
pnpm typecheck
```

Nothing in the suite touches the network or a real database (`DATABASE_URL` points at a dead port), and every backoff is injected, so the whole run takes under a second.

## Layout

| Path                           | What                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/agent.ts`                 | Turn loop: auth pre-flight → LLM ⇄ tools → reply; history in Postgres                                                                                                                                                                                              |
| `lib/prompt.ts`                | SwigBot system prompt (cache-stable core + per-user runtime context)                                                                                                                                                                                               |
| `lib/llm/`                     | Provider-agnostic chat: native Anthropic adapter + OpenAI-compat adapter (covers OpenAI/OpenRouter/Gemini/custom)                                                                                                                                                  |
| `lib/mcp/session.ts`           | MCP client per user token: 3 servers, tool discovery, deprecation watch                                                                                                                                                                                            |
| `lib/mcp/guardrails.ts`        | Code-level enforcement: confirmation gate on irreversible calls, one-success-per-turn latch on placement, required-arg validation, ₹1000 cap, ₹99 min, no blind retry of placement (check-then-retry), 10s track cooldown, phantom-coupon scrubbing, tool-call log |
| `lib/backoff.ts`               | The one retry loop: attempt cap, wall-clock budget, jittered exponential delay, injectable sleep                                                                                                                                                                   |
| `lib/mcp/retry.ts`             | MCP policy over it: backoff 500ms→8s, ≤5 attempts, 30s wall-clock budget                                                                                                                                                                                           |
| `lib/llm/backoff.ts`           | Provider policy over it: transient failures (429/5xx, honours `Retry-After`) so a saturated free tier doesn't kill a turn                                                                                                                                          |
| `lib/swiggy-auth.ts`           | DCR + per-user PKCE + token storage/logout                                                                                                                                                                                                                         |
| `app/api/webhook`              | Telegram webhook (instant ack, async processing, secret check, dedupe)                                                                                                                                                                                             |
| `app/api/auth/callback/swiggy` | OAuth redirect handler (+ Telegram notification)                                                                                                                                                                                                                   |
| `scripts/cli-chat.ts`          | Local REPL surface                                                                                                                                                                                                                                                 |
| `docs/swiggy/`                 | Vendored Swiggy Builders Club docs (auth, flows, recipes, all 51 tool references) - refresh with `pnpm docs:sync`                                                                                                                                                  |
| `scripts/sync-docs.ts`         | Re-vendors `docs/swiggy/` from `mcp.swiggy.com/builders/llms.txt` (`pnpm docs:sync`)                                                                                                                                                                               |

## Design notes & caveats

- **Numeric guardrails are best-effort**: Swiggy's docs don't publish full response schemas, so cart totals are found by tolerant key matching (`bill_total`, `grandTotal`, `total_to_pay`, …). A confident violation hard-blocks placement; anything ambiguous falls through to the prompt-level rules, which the model follows from real response values.
- **Order placement is never blind-retried.** On an ambiguous 5xx the wrapper waits, calls `get_food_orders` (with the `addressId` the placement carried) or `get_orders` (`activeOnly: true`), and hands the model both facts with explicit instructions. **Dineout is the exception**: the ship-to-production doc points at `get_booking_status`, but that tool requires the `orderId` a failed booking never returns and Dineout has no list-bookings tool, so a failed `book_table` is reported as genuinely unverifiable - do not retry, check the Swiggy app.
- **Consent has to be unconditional.** The confirmation gate checks for a veto before it checks for a yes, so "yes but change the address first", "ok wait", "yes no" and any reply ending in a question mark are refused. Plain "yes", "haan", "theek hai", "kar do", "go ahead", "place the order" and 👍 still open it.
- **Telegram is webhook-only** with plain `fetch` - no `node-telegram-bot-api` (that library is long-polling-oriented).
- **Orders can only succeed once per turn.** The confirmation gate opens on a "yes", but a "yes" stays true for the whole turn, so a model that calls `place_food_order` twice would be authorised twice. A successful placement latches the tool off for the rest of the turn; a failed one does not, so the documented single retry still works.
- **Rate limits**: none enforced by Swiggy MCP in v1.0; the bot still keeps `track_*` ≥10s apart - read from `tool_call_log`, not process memory, so the gap holds across serverless instances - and caches MCP sessions/addresses per turn.
- **Cancellations**: Food and Instamart still have no tool, so the bot gives Swiggy care: **080-67466729**. Dineout has `cancel_booking`, which is not rolled out to every account; when it is present the bot reads the booking back, takes an explicit yes, and calls it.
- **Swiggy access tokens are stored in plaintext** in `swiggy_tokens`. Deliberately deferred: they live 5 days, are revocable with `/logout`, and encrypting them needs a key-management story this demo doesn't have. Treat the database as sensitive.
