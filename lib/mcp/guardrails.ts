import { db, schema } from "../db";
import { withRetry, sleep } from "./retry";
import { isRetryableError } from "./errors";
import type { SwiggyMcpSession, ToolCallOutcome } from "./session";

/**
 * Enforces the spec's hard guardrails in code so they hold even if the model
 * slips. Swiggy publishes no response schemas, so numeric checks use tolerant
 * key matching and only hard-block on confident violations.
 */

const FOOD_CART_CAP_RUPEES = 1000; // Builders Club v1 hard cap
const INSTAMART_MIN_RUPEES = 99;
const TRACK_COOLDOWN_MS = 10_000;
const PLACEMENT_CHECK_DELAY_MS = 2_500;

/** Never blind-retried (spec Problem 4). */
const NON_IDEMPOTENT = new Set(["place_food_order", "checkout", "book_table"]);

/** Status tool consulted when a placement call fails ambiguously. */
const PLACEMENT_CHECK_TOOL: Record<string, string> = {
  place_food_order: "get_food_orders",
  checkout: "get_orders",
  book_table: "get_booking_status",
};

const TRACK_TOOLS = new Set(["track_food_order", "track_order"]);

const lastTrackAt = new Map<string, number>();

export async function executeGuardedTool(
  session: SwiggyMcpSession,
  userId: number,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallOutcome> {
  const started = Date.now();
  let outcome: ToolCallOutcome;
  let errorMessage: string | null = null;

  try {
    outcome = await runGuarded(session, userId, name, args);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    await log(session, userId, name, "error", Date.now() - started, errorMessage);
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

async function runGuarded(
  session: SwiggyMcpSession,
  userId: number,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallOutcome> {
  // Spec Problem 15: tracking at most once per 10s.
  if (TRACK_TOOLS.has(name)) {
    const key = `${userId}:${name}`;
    const last = lastTrackAt.get(key) ?? 0;
    const since = Date.now() - last;
    if (since < TRACK_COOLDOWN_MS) {
      return {
        text: `Tracking was checked ${Math.round(since / 1000)}s ago. Delivery ETAs update every ~10s - tell the user the last known status and to ask again in a minute. Do not call this tool again yet.`,
        isError: true,
        raw: null,
      };
    }
    lastTrackAt.set(key, Date.now());
  }

  // Spec Problems 1/6/18: fresh server-side cart check before any placement.
  if (name === "place_food_order" || name === "checkout") {
    const violation = await placementPrecheck(session, name);
    if (violation) return { text: violation, isError: true, raw: null };
  }

  if (!NON_IDEMPOTENT.has(name)) {
    const result = await withRetry(() => session.callTool(name, args));
    return postProcess(name, result);
  }

  // One attempt only; on ambiguous failure, check order status and report.
  try {
    return postProcess(name, await session.callTool(name, args));
  } catch (err) {
    if (!isRetryableError(err)) throw err;
    const checkTool = PLACEMENT_CHECK_TOOL[name];
    await sleep(PLACEMENT_CHECK_DELAY_MS);
    let checkText = "(status check also failed)";
    try {
      const check = await session.callTool(checkTool, {});
      checkText = check.text;
    } catch {
      /* keep placeholder */
    }
    return {
      text:
        `${name} hit a server error and MAY OR MAY NOT have gone through - it must not be blindly retried. ` +
        `Here is the current result of ${checkTool}:\n\n${checkText}\n\n` +
        `If the order/booking appears above, treat the placement as SUCCESSFUL and confirm it to the user. ` +
        `If it does not appear, you may retry ${name} exactly once.`,
      isError: true,
      raw: null,
    };
  }
}

/** Returns an error string when the placement must be blocked, else null. */
async function placementPrecheck(
  session: SwiggyMcpSession,
  placementTool: string,
): Promise<string | null> {
  const cartTool = placementTool === "place_food_order" ? "get_food_cart" : "get_cart";
  try {
    const cart = await withRetry(() => session.callTool(cartTool, {}), { maxAttempts: 2 });
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
    // Best-effort: a failed pre-check must never block ordering.
    return null;
  }
}

// ── Response post-processing ─────────────────────────────────────────────

function postProcess(name: string, outcome: ToolCallOutcome): ToolCallOutcome {
  if (outcome.isError) return outcome;

  // Spec Problem 7: coupon_discount=0 means suggested, not applied.
  if (name === "get_food_cart" || name === "update_food_cart" || name === "apply_food_coupon") {
    const parsed = tryParseJson(outcome.text);
    if (parsed && scrubPhantomCoupon(parsed)) {
      return { ...outcome, text: JSON.stringify(parsed) };
    }
  }

  // Spec Problem 5: v1 is COD-only, so drop online-payment coupons.
  if (name === "fetch_food_coupons") {
    const parsed = tryParseJson(outcome.text);
    if (parsed) {
      const removed = filterOnlineOnlyCoupons(parsed);
      if (removed > 0) {
        return {
          ...outcome,
          text:
            JSON.stringify(parsed) +
            `\n\n(Note: ${removed} coupon(s) requiring online payment were removed - orders are Cash on Delivery only.)`,
        };
      }
    }
  }

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

const TOTAL_KEY = /^(grand_?total|bill_?total|cart_?total|total_?(amount|payable|price|to_?pay|value)|total|payable_?amount|amount_?payable|to_?pay)$/i;

/** Max number found under a total-ish key; payable total dominates subtotals. */
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

/** Strips coupon_applied when coupon_discount is 0. Returns true if changed. */
export function scrubPhantomCoupon(value: unknown): boolean {
  let changed = false;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const discount = obj.coupon_discount ?? obj.couponDiscount;
      const applied = "coupon_applied" in obj ? "coupon_applied" : "couponApplied" in obj ? "couponApplied" : null;
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

const ONLINE_ONLY_KEY = /^(requires_?online_?payment|online_?payment_?only|online_?only)$/i;

/** Removes coupons flagged online-payment-only. Returns count removed. */
export function filterOnlineOnlyCoupons(value: unknown): number {
  let removed = 0;
  const isOnlineOnly = (item: unknown): boolean => {
    if (!item || typeof item !== "object") return false;
    return Object.entries(item).some(
      ([k, v]) => ONLINE_ONLY_KEY.test(k) && (v === true || v === "true"),
    );
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        if (isOnlineOnly(node[i])) {
          node.splice(i, 1);
          removed++;
        } else {
          walk(node[i]);
        }
      }
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(value);
  return removed;
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
