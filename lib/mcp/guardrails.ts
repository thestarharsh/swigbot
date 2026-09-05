import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { withRetry, sleep } from "./retry";
import { isRetryableError, messageOf } from "./errors";
import type { ServerKey, SwiggyMcpSession, ToolCallOutcome } from "./session";

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

/** Destructive too, but nothing is placed: gated on consent, never latched. */
const CONFIRM_REQUIRED = new Set([...IRREVERSIBLE, "delete_address"]);

/**
 * Consulted when a placement fails ambiguously. `book_table` is deliberately
 * absent: `get_booking_status` needs an orderId a failed booking never
 * returned, and Dineout has no list-bookings tool, so there is nothing to ask.
 */
const PLACEMENT_CHECK_TOOL: Record<string, string> = {
  place_food_order: "get_food_orders",
  checkout: "get_orders",
};

const TRACK_TOOLS = new Set(["track_food_order", "track_order"]);

/** Swiggy's own domain names, which differ from our server keys. */
const REPORT_DOMAIN: Record<ServerKey, string> = {
  food: "food",
  instamart: "im",
  dineout: "dineout",
};

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
    await log(session, userId, name, "error", Date.now() - started, messageOf(err));
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
  return { text, isError: true };
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

  // report_error exists on all three servers, so an omitted domain would be
  // auto-detected against whichever copy we happened to register.
  if (name === "report_error" && !args.domain && typeof args.tool === "string") {
    const server = session.serverFor(args.tool);
    if (server) args = { ...args, domain: REPORT_DOMAIN[server] };
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
  }

  if (IRREVERSIBLE.has(name) && turn?.completed?.has(name)) {
    return blocked(
      `BLOCKED - "${name}" already completed successfully in this turn. Calling it again ` +
        `would place a second, duplicate order. Read the earlier result: it holds the ` +
        `order id and status. Report that to the user instead of calling this tool again.`,
    );
  }

  if (CONFIRM_REQUIRED.has(name) && !isConfirmation(turn?.userText)) {
    const stake = IRREVERSIBLE.has(name)
      ? "spends real money"
      : "permanently deletes a saved address";
    const summary = IRREVERSIBLE.has(name)
      ? "items, total, address, payment method"
      : "which address, in full";
    return blocked(
      `BLOCKED - the user has not confirmed. "${name}" ${stake} and may only run ` +
        `immediately after the user explicitly agrees. Show the final summary (${summary}) ` +
        `and ask them to reply "Yes" to confirm. ` +
        `Do not call this tool again until they do.`,
    );
  }

  if (name === "place_food_order" || name === "checkout") {
    const violation = await placementPrecheck(session, name, args);
    if (violation) return blocked(violation);
  }

  if (!IRREVERSIBLE.has(name)) {
    const outcome = postProcess(name, await withRetry(() => session.callTool(name, args)));
    // Started only by a call that actually returned a status: a failed track
    // told the user nothing, so it must not cost them the next 10 seconds.
    if (TRACK_TOOLS.has(name) && !outcome.isError) {
      lastTrackAt.set(`${userId}:${name}`, Date.now());
    }
    return outcome;
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

    if (name === "book_table") {
      return blocked(
        `book_table hit a server error and MAY OR MAY NOT have created the booking. There is ` +
          `no way to verify it from here: get_booking_status needs an orderId that a failed ` +
          `booking never returned, and Dineout has no tool that lists bookings. Do NOT retry ` +
          `book_table - a retry could reserve a second table. Tell the user plainly that the ` +
          `booking may or may not have gone through, ask them to check Bookings in the Swiggy ` +
          `app, and to only try again if it is not there.`,
      );
    }

    const checkTool = PLACEMENT_CHECK_TOOL[name];
    await sleep(PLACEMENT_CHECK_DELAY_MS);
    const checkText = await checkPlacement(session, checkTool, args);
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

/**
 * Reads back whether an ambiguous placement actually landed. The check is
 * validated like any other call: sending it with a missing required argument
 * would return an error the model could misread as "the order is not there".
 */
async function checkPlacement(
  session: SwiggyMcpSession,
  checkTool: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = session.tools.find((t) => t.name === checkTool);
  if (!tool) {
    return `(${checkTool} is not available in this session, so this cannot be verified here)`;
  }
  const checkArgs = placementCheckArgs(checkTool, args);
  const missing = missingRequiredArgs(tool.inputSchema, checkArgs);
  if (missing.length) {
    return (
      `(cannot verify: ${checkTool} requires ${missing.join(", ")}, which the failed call ` +
      `did not carry - ask the user to check the Swiggy app)`
    );
  }
  try {
    return (await session.callTool(checkTool, checkArgs)).text;
  } catch {
    return "(status check also failed)";
  }
}

/** Forwards only the address args the guarded read itself requires. */
function cartArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const addressId = args.addressId ?? args.selectedAddressId;
  const needsAddress = new Set(["get_food_cart", "get_food_orders", "place_food_order"]);
  return needsAddress.has(tool) && addressId ? { addressId } : {};
}

function placementCheckArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  // get_orders defaults to 15 days of history; only an active order can be
  // the one that was just attempted.
  if (tool === "get_orders") return { activeOnly: true };
  return cartArgs(tool, args);
}

/**
 * Consent that is conditional, deferred or retracted is not consent. Checked
 * before the affirmative words, so "yes but change the address first" and
 * "sure, but what's the delivery time?" do not open the gate.
 */
const VETO_WORD =
  /\b(but|wait|no|nope|not|don\s?t|first|instead|hold|stop|cancel|nahi|nahin|mat|ruko|what|which|when|where|how|why|who|kya|kaise|kab|kahan)\b/i;

const AFFIRMATIVE_WORD =
  /^(ya|yes|yep|yeah|yup|ok|okay|sure|confirm|confirmed|proceed|haan|han|theek|thik|bilkul)\b/i;

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
  // A question is a request for more, never a go-ahead.
  if (text.endsWith("?")) return false;

  const words = text.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!words) return false;
  if (VETO_WORD.test(words)) return false;
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
      typeof key === "string" &&
      (args[key] === undefined || args[key] === null || args[key] === ""),
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

  if (name === "get_available_slots") {
    const parsed = tryParseJson(outcome.text);
    const hidden = parsed == null ? 0 : dropPaidSlots(parsed);
    if (hidden > 0) {
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

/**
 * Payable-style keys first, so a discount is not read as a violation: items
 * totalling ₹1100 with ₹200 off is a ₹900 order and must not be blocked.
 * Only when none is present does a bare subtotal count.
 */
const PAYABLE_KEY =
  /^(total_?to_?pay|to_?pay|amount_?payable|payable_?amount|total_?payable|grand_?total|bill_?total|final_?amount|net_?amount)$/i;

const SUBTOTAL_KEY = /^(cart_?total|total_?amount|total)$/i;

interface FoundTotal {
  value: number;
  depth: number;
}

export function extractCartTotal(value: unknown): number | null {
  const ranks: FoundTotal[][] = [[], []];
  const walk = (node: unknown, depth: number): void => {
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, depth + 1));
    } else if (node && typeof node === "object") {
      for (const [key, val] of Object.entries(node)) {
        const rank = PAYABLE_KEY.test(key) ? 0 : SUBTOTAL_KEY.test(key) ? 1 : -1;
        if (rank >= 0) {
          const n = typeof val === "number" ? val : Number(val);
          if (Number.isFinite(n) && n >= 0) ranks[rank].push({ value: n, depth });
        }
        walk(val, depth + 1);
      }
    }
  };
  walk(value, 0);

  const found = ranks.find((r) => r.length);
  if (!found) return null;
  // A bill-level total sits above the line items that make it up.
  const shallowest = Math.min(...found.map((f) => f.depth));
  return Math.max(...found.filter((f) => f.depth === shallowest).map((f) => f.value));
}

/**
 * Problem 13: only free Dineout slots may reach the model. Paid deals are
 * rejected at cart creation anyway, so surfacing one only invites a booking
 * that cannot complete. Returns how many entries were removed.
 */
export function dropPaidSlots(value: unknown): number {
  let hidden = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const child = node[i];
        if (isRecord(child) && isPaidSlot(child)) {
          node.splice(i, 1);
          hidden++;
        } else {
          walk(child);
        }
      }
      return;
    }
    if (isRecord(node)) Object.values(node).forEach(walk);
  };
  walk(value);

  if (hidden > 0) {
    const note =
      `${hidden} paid/prime slot${hidden > 1 ? "s were" : " was"} hidden - only free ` +
      `Dineout slots (isFree true, bookingPrice 0) can be booked.`;
    if (Array.isArray(value)) value.push({ _paid_slots_hidden: note });
    else if (isRecord(value)) value._paid_slots_hidden = note;
  }
  return hidden;
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return !!node && typeof node === "object" && !Array.isArray(node);
}

/** Tolerant to key casing; Swiggy publishes no schema for the slot payload. */
function isPaidSlot(node: Record<string, unknown>): boolean {
  const free = node.isFree ?? node.is_free;
  if (free === false || free === "false") return true;
  const raw = node.bookingPrice ?? node.booking_price;
  const price = typeof raw === "number" ? raw : Number(raw);
  return raw != null && raw !== "" && Number.isFinite(price) && price > 0;
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
        "coupon_applied" in obj
          ? "coupon_applied"
          : "couponApplied" in obj
            ? "couponApplied"
            : null;
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
