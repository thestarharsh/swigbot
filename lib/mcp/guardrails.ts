import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { withRetry, sleep } from "./retry";
import { isRetryableError } from "./errors";
import type { SwiggyMcpSession, ToolCallOutcome } from "./session";

/**
 * Hard guardrails enforced in code, so they hold when the model ignores the
 * prompt. Swiggy publishes no response schemas, so numeric checks match keys
 * tolerantly and only block on a confident violation.
 */

const FOOD_CART_CAP_RUPEES = 1000;
const INSTAMART_MIN_RUPEES = 99;
const TRACK_COOLDOWN_MS = 10_000;
const PLACEMENT_CHECK_DELAY_MS = 2_500;

/** Spends money or reserves a table: never retried blindly, never unconfirmed. */
const IRREVERSIBLE = new Set(["place_food_order", "checkout", "book_table"]);

/** Consulted when an irreversible call fails ambiguously. */
const PLACEMENT_CHECK_TOOL: Record<string, string> = {
  place_food_order: "get_food_orders",
  checkout: "get_orders",
  book_table: "get_booking_status",
};

const TRACK_TOOLS = new Set(["track_food_order", "track_order"]);

const lastTrackAt = new Map<string, number>();

/** What the user said this turn, for the confirmation gate. */
export interface TurnContext {
  userText: string;
  /**
   * Irreversible tools that have already succeeded this turn. A latch, not a
   * counter: the repeat-breaker in the agent only compares arguments, so
   * without this a second `place_food_order` spends money again.
   */
  completed?: Set<string>;
}

export async function executeGuardedTool(
  session: SwiggyMcpSession,
  userId: number,
  name: string,
  args: Record<string, unknown>,
  turn?: TurnContext,
): Promise<ToolCallOutcome> {
  const started = Date.now();
  let outcome: ToolCallOutcome;

  try {
    outcome = await runGuarded(session, userId, name, args, turn);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log(session, userId, name, "error", Date.now() - started, message);
    throw err;
  }

  await log(
    session,
    userId,
    name,
    outcome.isError ? "domain_error" : "ok",
    Date.now() - started,
    outcome.isError ? outcome.text.slice(0, 500) : null,
  );
  return outcome;
}

function blocked(text: string): ToolCallOutcome {
  return { text, isError: true, raw: null };
}

async function runGuarded(
  session: SwiggyMcpSession,
  userId: number,
  name: string,
  args: Record<string, unknown>,
  turn: TurnContext | undefined,
): Promise<ToolCallOutcome> {
  const tool = session.tools.find((t) => t.name === name);
  if (!tool) {
    return blocked(
      `No tool named "${name}" exists. ${suggestTools(name, session)} ` +
        `Use only tools from the provided list, with their exact names.`,
    );
  }

  const missing = missingRequiredArgs(tool.inputSchema, args);
  if (missing.length) {
    return blocked(
      `Call rejected before it was sent: "${name}" requires ${missing.join(", ")}, ` +
        `which ${missing.length > 1 ? "were" : "was"} not provided. Fetch the missing value ` +
        `with the appropriate tool (addresses via get_addresses, Dineout locations via ` +
        `get_saved_locations) and call again. Never invent an ID.`,
    );
  }

  if (TRACK_TOOLS.has(name)) {
    const since = await msSinceLastTrack(userId, name);
    if (since != null && since < TRACK_COOLDOWN_MS) {
      return blocked(
        `Tracking was checked ${Math.round(since / 1000)}s ago. ETAs update every ~10s - ` +
          `give the user the last known status and suggest asking again in a minute. ` +
          `Do not call this tool again yet.`,
      );
    }
    lastTrackAt.set(`${userId}:${name}`, Date.now());
  }

  if (IRREVERSIBLE.has(name)) {
    if (turn?.completed?.has(name)) {
      return blocked(
        `BLOCKED - "${name}" already completed successfully in this turn. Calling it again ` +
          `would place a second, duplicate order. Read the earlier result: it holds the ` +
          `order id and status. Report that to the user instead of calling this tool again.`,
      );
    }
    if (!isConfirmation(turn?.userText)) {
      return blocked(
        `BLOCKED - the user has not confirmed. "${name}" spends real money and may only run ` +
          `immediately after the user explicitly agrees. Show the final summary (items, total, ` +
          `address, payment method) and ask them to reply "Yes" to confirm. ` +
          `Do not call this tool again until they do.`,
      );
    }
  }

  if (name === "place_food_order" || name === "checkout") {
    const violation = await placementPrecheck(session, name, args);
    if (violation) return blocked(violation);
  }

  if (!IRREVERSIBLE.has(name)) {
    return postProcess(name, await withRetry(() => session.callTool(name, args)));
  }

  try {
    const outcome = postProcess(name, await session.callTool(name, args));
    // Latched on success only. A domain error means the order did not go
    // through, and the ambiguous failure below is still owed the single retry
    // the ship-to-production contract allows.
    if (!outcome.isError) turn?.completed?.add(name);
    return outcome;
  } catch (err) {
    if (!isRetryableError(err)) throw err;
    const checkTool = PLACEMENT_CHECK_TOOL[name];
    await sleep(PLACEMENT_CHECK_DELAY_MS);
    let checkText = "(status check also failed)";
    try {
      checkText = (await session.callTool(checkTool, cartArgs(checkTool, args))).text;
    } catch {
      // Keep the placeholder; the model is told the check itself failed.
    }
    return blocked(
      `${name} hit a server error and MAY OR MAY NOT have gone through - it must not be ` +
        `blindly retried. Current result of ${checkTool}:\n\n${checkText}\n\n` +
        `If the order/booking appears above, treat the placement as SUCCESSFUL and confirm it ` +
        `to the user. If it does not appear, you may retry ${name} exactly once.`,
    );
  }
}

/**
 * Age of this user's last successful track call, or null if there is none.
 * Memory is per-instance and serverless instances share none, so the tool-call
 * log is the cross-instance source of truth - the same reason update dedupe
 * lives in Postgres. The elapsed time is computed server-side: `created_at` is
 * `timestamp without time zone`, so parsing it client-side would read a UTC
 * value in the process's own zone. An unreachable database falls back to
 * memory rather than blocking a legitimate check.
 */
async function msSinceLastTrack(userId: number, tool: string): Promise<number | null> {
  const remembered = lastTrackAt.get(`${userId}:${tool}`);
  const local = remembered == null ? null : Date.now() - remembered;
  // Already inside the cooldown on this instance: nothing older can change that.
  if (local != null && local < TRACK_COOLDOWN_MS) return local;

  try {
    const { rows } = await db.execute(sql`
      select extract(epoch from (now() - ${schema.toolCallLog.createdAt})) * 1000 as ms
      from ${schema.toolCallLog}
      where ${schema.toolCallLog.userId} = ${userId}
        and ${schema.toolCallLog.tool} = ${tool}
        and ${schema.toolCallLog.status} = 'ok'
      order by ${schema.toolCallLog.id} desc
      limit 1
    `);
    const ms = Number((rows[0] as { ms?: unknown } | undefined)?.ms);
    if (!Number.isFinite(ms)) return local;
    return local == null ? ms : Math.min(local, ms);
  } catch {
    return local;
  }
}

/** Forwards only the address args the guarded read itself requires. */
function cartArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const addressId = args.addressId ?? args.selectedAddressId;
  const needsAddress = new Set(["get_food_cart", "get_food_orders", "place_food_order"]);
  return needsAddress.has(tool) && addressId ? { addressId } : {};
}

const AFFIRMATIVE_WORD =
  /^(y|ya|yes|yep|yeah|yup|ok|okay|sure|confirm|confirmed|proceed|done|go|haan|ha|han|theek|thik|bilkul)\b/i;

const AFFIRMATIVE_PHRASE =
  /\b(place (the |my )?order|go ahead|do it|book it|confirm(ing)? (it|the order)|order (it|kar do)|place kar do|kar do)\b/i;

/**
 * True when the user's own words authorise the action. Emoji count, since the
 * prompt offers "Reply Yes ✅". No turn context means unconfirmed, so a
 * non-conversational caller can never place an order.
 */
export function isConfirmation(userText: string | undefined): boolean {
  if (!userText) return false;
  const text = userText.trim();
  if (!text) return false;
  if (/^[✅👍🆗👌]+$/u.test(text)) return true;

  const words = text.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!words) return false;
  if (AFFIRMATIVE_PHRASE.test(words)) return true;
  // A leading "yes" counts only in a short reply; a long sentence opening
  // with "ok" is just conversation.
  return AFFIRMATIVE_WORD.test(words) && words.length <= 40;
}

/** Required properties absent from args, per the schema discovered from MCP. */
export function missingRequiredArgs(
  inputSchema: Record<string, unknown>,
  args: Record<string, unknown>,
): string[] {
  const required = inputSchema?.required;
  if (!Array.isArray(required)) return [];
  return required.filter(
    (key): key is string =>
      typeof key === "string" && (args[key] === undefined || args[key] === null || args[key] === ""),
  );
}

function suggestTools(name: string, session: SwiggyMcpSession): string {
  const needle = name.toLowerCase().replace(/[^a-z]/g, "");
  const close = session.tools
    .filter((t) => {
      const hay = t.name.toLowerCase().replace(/[^a-z]/g, "");
      return hay.includes(needle) || needle.includes(hay);
    })
    .slice(0, 3)
    .map((t) => t.name);
  return close.length ? `Did you mean: ${close.join(", ")}?` : "";
}

/**
 * Error string when the placement must be blocked, else null. Without the
 * forwarded addressId Swiggy rejects the cart read and the cap silently
 * stops being enforced.
 */
async function placementPrecheck(
  session: SwiggyMcpSession,
  placementTool: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  const cartTool = placementTool === "place_food_order" ? "get_food_cart" : "get_cart";
  try {
    const cart = await withRetry(() => session.callTool(cartTool, cartArgs(cartTool, args)), {
      maxAttempts: 2,
    });
    if (cart.isError) return null;
    const total = extractCartTotal(tryParseJson(cart.text));
    if (total == null) return null;

    if (placementTool === "place_food_order" && total > FOOD_CART_CAP_RUPEES) {
      return `BLOCKED: the food cart total is ₹${total}, over the ₹${FOOD_CART_CAP_RUPEES} order limit. Ask the user to remove an item to bring the total under ₹${FOOD_CART_CAP_RUPEES}, then try again.`;
    }
    if (placementTool === "checkout" && total < INSTAMART_MIN_RUPEES) {
      return `BLOCKED: the Instamart cart total is ₹${total}, under the ₹${INSTAMART_MIN_RUPEES} minimum order value. Ask the user to add something else before checking out.`;
    }
    return null;
  } catch {
    // A failed pre-check must never block ordering.
    return null;
  }
}

function postProcess(name: string, outcome: ToolCallOutcome): ToolCallOutcome {
  if (outcome.isError) return outcome;

  if (name === "get_food_cart" || name === "update_food_cart" || name === "apply_food_coupon") {
    const parsed = tryParseJson(outcome.text);
    if (parsed && scrubPhantomCoupon(parsed)) {
      return { ...outcome, text: JSON.stringify(parsed) };
    }
  }

  // Coupons are deliberately not filtered by payment method. The spec promised
  // COD-only, but live orders refuse cash and settle over UPI, so filtering out
  // online-payment coupons removed the only ones that could ever apply.

  return outcome;
}

export function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

const TOTAL_KEY =
  /^(grand_?total|bill_?total|cart_?total|total_?(amount|payable|price|to_?pay|value)|total|payable_?amount|amount_?payable|to_?pay)$/i;

/** Largest number under a total-ish key; the payable total dominates subtotals. */
export function extractCartTotal(value: unknown): number | null {
  const found: number[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      for (const [key, val] of Object.entries(node)) {
        if (TOTAL_KEY.test(key)) {
          const n = typeof val === "number" ? val : Number(val);
          if (Number.isFinite(n) && n >= 0) found.push(n);
        }
        walk(val);
      }
    }
  };
  walk(value);
  return found.length ? Math.max(...found) : null;
}

/** Drops coupon_applied when coupon_discount is 0. Returns true if changed. */
export function scrubPhantomCoupon(value: unknown): boolean {
  let changed = false;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const discount = obj.coupon_discount ?? obj.couponDiscount;
      const applied =
        "coupon_applied" in obj ? "coupon_applied" : "couponApplied" in obj ? "couponApplied" : null;
      if (applied && (discount === 0 || discount === "0" || discount == null)) {
        delete obj[applied];
        obj._coupon_note = "No coupon is actually applied (coupon_discount was 0).";
        changed = true;
      }
      Object.values(obj).forEach(walk);
    }
  };
  walk(value);
  return changed;
}

async function log(
  session: SwiggyMcpSession,
  userId: number,
  tool: string,
  status: string,
  durationMs: number,
  errorMessage: string | null,
): Promise<void> {
  try {
    await db.insert(schema.toolCallLog).values({
      userId,
      server: session.serverFor(tool) ?? null,
      tool,
      status,
      durationMs,
      errorMessage,
    });
  } catch {
    // Logging must never break the ordering flow.
  }
}
