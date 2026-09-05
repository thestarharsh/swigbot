# SwigBot - notes for AI coding agents

Conversational commerce agent on Swiggy MCP (Food `/food`, Instamart `/im`, Dineout `/dineout` at `mcp.swiggy.com`). Read `README.md` for the runbook.

## Authoritative references (vendored, read before coding against Swiggy)

Vendored by `pnpm docs:sync`, which re-fetches every page listed in Swiggy's `llms.txt`. Re-run it before coding against anything new: the live changelog page lags the reference pages badly.

- `docs/swiggy/start/authenticate.md` - OAuth 2.1 + PKCE. **No client secret exists**: Dynamic Client Registration at `POST /auth/register`. Token exchange is **JSON-bodied**. Access tokens live 5 days, **no refresh tokens in v1** - on 401 re-run authorization. Auth codes: 120s, single-use.
- `docs/swiggy/build/ship-to-production.md` - retry/idempotency contract: reads + cart mutations + `apply_food_coupon` are retriable; `place_food_order`/`checkout`/`book_table` are NOT (check-then-retry via `get_food_orders`/`get_orders`; the doc's `get_booking_status` suggestion does not work - see the invariants). Backoff 500ms→8s, ≤5 tries, 30s wall clock.
- `docs/swiggy/build/recipes/pay-with-upi.md` - the shared Payment stage end-to-end, including the **headless** section this bot implements: text method list, `bridgeUrl`, self-driven status check, explicit `confirm_order`.
- `docs/swiggy/blog/2026-07-10-mcp-payments-upi.md` - why `PENDING_PAYMENT` exists, why `check_payment_status` must not be looped (a ~19s long poll over Swiggy's payment cache), and the per-server `confirm_order` contract.
- `docs/swiggy/blog/2026-08-24-create-address-ga.md` - `create_address`/`delete_address` are GA for every account, coordinates are optional and geocoded server-side, and the app handoff is gone.
- `docs/swiggy/reference/errors.md` - no symbolic `error.code` in v1; classify by HTTP status + message prefix. Domain failures (HTTP 200, `success:false`) are terminal.
- `docs/swiggy/reference/{food,instamart,dineout}/*.md` - per-tool references, 51 tools (Food 20, Instamart 19, Dineout 12). Response schemas are NOT fully documented - hence the tolerant extractors in `lib/mcp/guardrails.ts`.

## Invariants (do not weaken)

- Never blind-retry `place_food_order` / `checkout` / `book_table`. `guardrails.ts` does check-then-retry for the first two (`get_food_orders` with the forwarded `addressId`; `get_orders` with `activeOnly: true`). `book_table` has **no** check: `get_booking_status` needs an `orderId` a failed booking never returned and Dineout lists no bookings, so the model is told the booking is unverifiable and must not retry.
- `place_food_order` / `checkout` / `book_table` / `delete_address` / `cancel_booking` are rejected unless the user's own latest message is a confirmation (`isConfirmation`). A caller with no turn context can never place an order. `isConfirmation` vetoes before it accepts: a conditional, deferred, retracted or interrogative reply ("yes but change the address first", "ok wait", "yes no", "sure, but what's the delivery time?") is not consent, however it starts.
- An irreversible tool that has already **succeeded** this turn is latched off (`TurnContext.completed`) - the agent's repeat-breaker only compares arguments, so it cannot stop a duplicate order placed with a tweaked payload. Latch on success only: a domain error means nothing was placed, and an ambiguous 5xx is still owed its one documented retry.
- A guardrail's own read must forward the args that read requires (`get_food_cart` and `get_food_orders` take `addressId`). Calling them bare makes the cart cap silently unenforceable. Check `pnpm schemas` for required args.
- Food cart hard cap ₹1000; Instamart minimum ₹99 (Builders Club v1).
- `coupon_discount = 0` + `coupon_applied` ⇒ coupon is NOT applied - scrubbed before the LLM sees it.
- Only free Dineout slots reach the model: `postProcess` strips `get_available_slots` entries with `isFree` false or `bookingPrice > 0` and notes how many were hidden. Deliberate, and unchanged by UPI payments - the paid-prebook path needs `create_cart`/`cartKey`, which this bot does not use, so a paid deal could only ever fail at booking.
- Cart totals are read payable-key-first (`total_to_pay`, `grand_total`, …), never as the maximum of every total-ish key - that blocked any order carrying a discount.
- Payment methods come from `get_payment_options`, called after the user's yes and before placement - never from the spec, the cart, or a guess. Cash is offered only when `cod.available`; a UPI method's `id` goes into `intentApp` verbatim, a `qr` method sets `generateUPIQR`. Never ask for a UPI ID/VPA (NPCI) or which device the user is on. Coupons are never filtered by payment method - that filter removed the only coupons that could apply.
- **`PENDING_PAYMENT` is not placed.** A UPI placement succeeds with the order merely reserved; only payment plus confirmation places it. `postProcess` appends `_payment_note` to such a result, the user gets `bridgeUrl` bare (https, so Telegram links it - never the `upi://` link, and no QR is rendered), and the turn ends there. **No in-turn poll loop**: the webhook's `maxDuration` is 60s and the status call long-polls ~19s, so the flow is user-driven across turns.
- One `check_payment_status` per user message, enforced by the same 10s cooldown as tracking (`RATE_LIMITED_READS`).
- `confirm_order` is documented idempotent and never places an unpaid order, so it is retried by `withRetry` and carries **no** consent gate - the user consented at placement and paid with their own hands. It is latched to once per `orderId` per turn (`TurnContext.confirmedOrders`) and refuses to run without an `orderId`.
- `RATE_LIMITED_READS` (`track_*`, `get_food_delivery_status`, `get_delivery_status`, `check_payment_status`): ≥10s between calls per user per tool, enforced against `tool_call_log` (memory is per-instance; serverless shares none).
- Food/Instamart tools take `addressId`; Dineout takes lat/lng - never cross.
- Cancellation: Food and Instamart still have no tool, so the bot gives 080-67466729. Dineout has `cancel_booking` (not rolled out to every account) - in `CONFIRM_REQUIRED`, so it needs the user's own yes, and never latched or check-then-retried.
- `create_address` is GA and coordinates are optional: the guardrail **strips** `latitude`/`longitude` unless the user's own message this turn contains a coordinate pair. The reference example is 12.9716, 77.5946, which is what a model pastes when it thinks the fields are required, and a wrong pin misdelivers a real order. `addressCategory` outside the five allowed values is blocked pre-call.
- Cart state is server-side: fetch fresh at every turn boundary, never trust conversation memory.
- One turn per user at a time, enforced by the `turn_locks` row `runAgentTurn` takes and releases (90s TTL, longer than the webhook's `maxDuration`). Serverless instances share nothing else, and two interleaved turns fight over one server-side cart. An unreachable database fails open.
- `WEBHOOK_SECRET` is required in production: the webhook route throws at module load on Vercel or `NODE_ENV=production` without it, and `pnpm webhook:set` refuses to register.

## Conventions

- LLM access only through `lib/llm` (`getChatModel()`); Anthropic native + OpenAI-compat adapters cover all BYOK providers. Anthropic model IDs: use exact aliases (`claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`) - never date-suffixed variants.
- All tool calls go through `executeGuardedTool` - never call `SwiggyMcpSession.callTool` directly from the agent.
- System prompt lives in `lib/prompt.ts`, split stable/dynamic for prompt caching - don't interpolate volatile values into the stable half.
- DB via Drizzle (`lib/db/schema.ts`); Postgres is hosted (Neon), `DATABASE_URL` must be the **direct** endpoint - the pooled one leaks `search_path` between clients; `pnpm db:push` after schema changes, `pnpm db:reset --yes` to wipe rows.
- Scripts must `import "./load-env"` FIRST. Imports evaluate before statements, so an inline `config()` leaves `lib/db` already initialised and `DATABASE_URL` ignored. `scripts/sync-docs.ts` is the exception - it touches neither the database nor Swiggy MCP, only the public docs site, and guards its `main()` so its exported helpers stay unit-testable.
- One backoff loop (`lib/backoff.ts`); `withRetry` (MCP) and `withLlmRetry` (providers) are thin policies over it, and both take an injectable `sleep` so tests never wait. One `sleep` (`lib/util/sleep.ts`), one Swiggy base URL and server list (`lib/swiggy-config.ts`), one `messageOf` (`lib/mcp/errors.ts`).
- `scripts/verify-db.ts` derives its expectations from the Drizzle schema - add a column in `schema.ts` and nothing else needs touching.
- Verify with `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`, then `pnpm smoke` when a live check is wanted (smoke hits live Swiggy DCR + local DB). `pnpm docs:sync` re-vendors `docs/swiggy/` from the live site.
