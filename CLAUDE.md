# SwigBot - notes for AI coding agents

Conversational commerce agent on Swiggy MCP (Food `/food`, Instamart `/im`, Dineout `/dineout` at `mcp.swiggy.com`). Read `README.md` for the runbook.

## Authoritative references (vendored, read before coding against Swiggy)

- `docs/swiggy/docs/start/authenticate.md` - OAuth 2.1 + PKCE. **No client secret exists**: Dynamic Client Registration at `POST /auth/register`. Token exchange is **JSON-bodied**. Access tokens live 5 days, **no refresh tokens in v1** - on 401 re-run authorization. Auth codes: 120s, single-use.
- `docs/swiggy/docs/build/ship-to-production.md` - retry/idempotency contract: reads + cart mutations + `apply_food_coupon` are retriable; `place_food_order`/`checkout`/`book_table` are NOT (check-then-retry via `get_food_orders`/`get_orders`; the doc's `get_booking_status` suggestion does not work - see the invariants). Backoff 500ms→8s, ≤5 tries, 30s wall clock.
- `docs/swiggy/docs/reference/errors.md` - no symbolic `error.code` in v1; classify by HTTP status + message prefix. Domain failures (HTTP 200, `success:false`) are terminal.
- `docs/swiggy/docs/reference/{food,instamart,dineout}/*.md` - per-tool references. Response schemas are NOT fully documented - hence the tolerant extractors in `lib/mcp/guardrails.ts`.

## Invariants (do not weaken)

- Never blind-retry `place_food_order` / `checkout` / `book_table`. `guardrails.ts` does check-then-retry for the first two (`get_food_orders` with the forwarded `addressId`; `get_orders` with `activeOnly: true`). `book_table` has **no** check: `get_booking_status` needs an `orderId` a failed booking never returned and Dineout lists no bookings, so the model is told the booking is unverifiable and must not retry.
- `place_food_order` / `checkout` / `book_table` / `delete_address` are rejected unless the user's own latest message is a confirmation (`isConfirmation`). A caller with no turn context can never place an order. `isConfirmation` vetoes before it accepts: a conditional, deferred, retracted or interrogative reply ("yes but change the address first", "ok wait", "yes no", "sure, but what's the delivery time?") is not consent, however it starts.
- An irreversible tool that has already **succeeded** this turn is latched off (`TurnContext.completed`) - the agent's repeat-breaker only compares arguments, so it cannot stop a duplicate order placed with a tweaked payload. Latch on success only: a domain error means nothing was placed, and an ambiguous 5xx is still owed its one documented retry.
- A guardrail's own read must forward the args that read requires (`get_food_cart` and `get_food_orders` take `addressId`). Calling them bare makes the cart cap silently unenforceable. Check `pnpm schemas` for required args.
- Food cart hard cap ₹1000; Instamart minimum ₹99 (Builders Club v1).
- `coupon_discount = 0` + `coupon_applied` ⇒ coupon is NOT applied - scrubbed before the LLM sees it.
- Only free Dineout slots reach the model: `postProcess` strips `get_available_slots` entries with `isFree` false or `bookingPrice > 0` and notes how many were hidden. Paid deals are rejected at cart creation anyway.
- Cart totals are read payable-key-first (`total_to_pay`, `grand_total`, …), never as the maximum of every total-ish key - that blocked any order carrying a discount.
- Payment method is **not** fixed. The spec promised COD-only, but live orders refuse cash ("cash option is temporarily unavailable") and settle over UPI, so coupons are never filtered by payment method - that filter removed the only coupons that could apply. Offer whatever the tools actually return.
- `track_*` tools: ≥10s between calls per user, enforced against `tool_call_log` (memory is per-instance; serverless shares none).
- Food/Instamart tools take `addressId`; Dineout takes lat/lng - never cross.
- No cancellation tool exists; the bot gives 080-67466729.
- Cart state is server-side: fetch fresh at every turn boundary, never trust conversation memory.
- One turn per user at a time, enforced by the `turn_locks` row `runAgentTurn` takes and releases (90s TTL, longer than the webhook's `maxDuration`). Serverless instances share nothing else, and two interleaved turns fight over one server-side cart. An unreachable database fails open.
- `WEBHOOK_SECRET` is required in production: the webhook route throws at module load on Vercel or `NODE_ENV=production` without it, and `pnpm webhook:set` refuses to register.

## Conventions

- LLM access only through `lib/llm` (`getChatModel()`); Anthropic native + OpenAI-compat adapters cover all BYOK providers. Anthropic model IDs: use exact aliases (`claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`) - never date-suffixed variants.
- All tool calls go through `executeGuardedTool` - never call `SwiggyMcpSession.callTool` directly from the agent.
- System prompt lives in `lib/prompt.ts`, split stable/dynamic for prompt caching - don't interpolate volatile values into the stable half.
- DB via Drizzle (`lib/db/schema.ts`); Postgres is hosted (Neon), `DATABASE_URL` must be the **direct** endpoint - the pooled one leaks `search_path` between clients; `pnpm db:push` after schema changes, `pnpm db:reset --yes` to wipe rows.
- Scripts must `import "./load-env"` FIRST. Imports evaluate before statements, so an inline `config()` leaves `lib/db` already initialised and `DATABASE_URL` ignored.
- One backoff loop (`lib/backoff.ts`); `withRetry` (MCP) and `withLlmRetry` (providers) are thin policies over it, and both take an injectable `sleep` so tests never wait. One `sleep` (`lib/util/sleep.ts`), one Swiggy base URL and server list (`lib/swiggy-config.ts`), one `messageOf` (`lib/mcp/errors.ts`).
- `scripts/verify-db.ts` derives its expectations from the Drizzle schema - add a column in `schema.ts` and nothing else needs touching.
- Verify with `pnpm lint && pnpm typecheck && pnpm test`, then `pnpm smoke` when a live check is wanted (smoke hits live Swiggy DCR + local DB).
