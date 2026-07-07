# SwigBot - notes for AI coding agents

Conversational commerce agent on Swiggy MCP (Food `/food`, Instamart `/im`, Dineout `/dineout` at `mcp.swiggy.com`). Read `README.md` for the runbook.

## Authoritative references (vendored, read before coding against Swiggy)

- `docs/swiggy/docs/start/authenticate.md` - OAuth 2.1 + PKCE. **No client secret exists**: Dynamic Client Registration at `POST /auth/register`. Token exchange is **JSON-bodied**. Access tokens live 5 days, **no refresh tokens in v1** - on 401 re-run authorization. Auth codes: 120s, single-use.
- `docs/swiggy/docs/build/ship-to-production.md` - retry/idempotency contract: reads + cart mutations + `apply_food_coupon` are retriable; `place_food_order`/`checkout`/`book_table` are NOT (check-then-retry via `get_food_orders`/`get_orders`/`get_booking_status`). Backoff 500ms→8s, ≤5 tries, 30s wall clock.
- `docs/swiggy/docs/reference/errors.md` - no symbolic `error.code` in v1; classify by HTTP status + message prefix. Domain failures (HTTP 200, `success:false`) are terminal.
- `docs/swiggy/docs/reference/{food,instamart,dineout}/*.md` - per-tool references. Response schemas are NOT fully documented - hence the tolerant extractors in `lib/mcp/guardrails.ts`.

## Invariants (do not weaken)

- Never blind-retry `place_food_order` / `checkout` / `book_table` - `guardrails.ts` does check-then-retry.
- Food cart hard cap ₹1000; Instamart minimum ₹99 (Builders Club v1).
- `coupon_discount = 0` + `coupon_applied` ⇒ coupon is NOT applied - scrubbed before the LLM sees it.
- COD is the only payment method in v1; online-payment coupons are filtered out.
- `track_*` tools: ≥10s between calls per user.
- Food/Instamart tools take `addressId`; Dineout takes lat/lng - never cross.
- No cancellation tool exists; the bot gives 080-67466729.
- Cart state is server-side: fetch fresh at every turn boundary, never trust conversation memory.

## Conventions

- LLM access only through `lib/llm` (`getChatModel()`); Anthropic native + OpenAI-compat adapters cover all BYOK providers. Anthropic model IDs: use exact aliases (`claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`) - never date-suffixed variants.
- All tool calls go through `executeGuardedTool` - never call `SwiggyMcpSession.callTool` directly from the agent.
- System prompt lives in `lib/prompt.ts`, split stable/dynamic for prompt caching - don't interpolate volatile values into the stable half.
- DB via Drizzle (`lib/db/schema.ts`); dev Postgres from `docker compose up -d` on port **5433**; `pnpm db:push` after schema changes.
- Verify with `pnpm typecheck && pnpm test && pnpm smoke` (smoke hits live Swiggy DCR + local DB).
