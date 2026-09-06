import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import {
  cartItemsOf,
  menuItemIdOf,
  observeToolResult,
  parseCartText,
  quantityOf,
  totalFromText,
  type ConversationFacts,
} from "./facts";
import { withRetry, sleep } from "./retry";
import { isRetryableError, messageOf } from "./errors";
import type { ServerKey, SwiggyMcpSession, ToolCallOutcome } from "./session";

/**
 * Hard guardrails enforced in code, so they hold when the model ignores the
 * prompt. Swiggy publishes no response schemas, so numeric checks match keys
 * tolerantly and only block on a confident violation. What this file enforces:
 * the consent gate on irreversible and destructive calls, the one-success-per-
 * turn placement latch, the one-per-order-per-turn `confirm_order` latch,
 * required-argument validation, the ₹1000 food cap and ₹99 Instamart minimum,
 * check-then-retry instead of blind placement retries, a 10s cooldown on the
 * rate-limited reads (tracking, delivery status, payment status), the
 * phantom-coupon scrub, the paid-Dineout-slot filter, the PENDING_PAYMENT
 * note, invented `create_address` coordinates, and the tool-call log.
 */

const FOOD_CART_CAP_RUPEES = 1000;
const INSTAMART_MIN_RUPEES = 99;
const READ_COOLDOWN_MS = 10_000;
const PLACEMENT_CHECK_DELAY_MS = 2_500;

/** Spends money or reserves a table: never retried blindly, never unconfirmed. */
const IRREVERSIBLE = new Set(["place_food_order", "checkout", "book_table"]);

/**
 * Destructive too, but nothing is placed: gated on consent, never latched.
 * `confirm_order` is deliberately absent from both sets - the user already
 * consented at placement and then paid with their own hands, and the tool is
 * documented idempotent, so it is retriable and needs no second yes.
 */
const CONFIRM_REQUIRED = new Set([...IRREVERSIBLE, "delete_address", "cancel_booking"]);

/** The five values Swiggy's create_address schema accepts. */
const ADDRESS_CATEGORIES = ["HOME", "WORK", "OFFICE", "FRIENDS_AND_FAMILY", "OTHER"];

/**
 * Consulted when a placement fails ambiguously. `book_table` is deliberately
 * absent: `get_booking_status` needs an orderId a failed booking never
 * returned, and Dineout has no list-bookings tool, so there is nothing to ask.
 */
const PLACEMENT_CHECK_TOOL: Record<string, string> = {
  place_food_order: "get_food_orders",
  checkout: "get_orders",
};

/**
 * Reads whose value changes slowly and whose backend does not want a loop:
 * ETAs refresh every ~10s, and `check_payment_status` is a ~19s long-poll
 * against Swiggy's payment cache that the docs ask agents not to hammer.
 */
const RATE_LIMITED_READS = new Set([
  "track_food_order",
  "track_order",
  "check_payment_status",
  "get_food_delivery_status",
  "get_delivery_status",
]);

/** Swiggy's own domain names, which differ from our server keys. */
const REPORT_DOMAIN: Record<ServerKey, string> = {
  food: "food",
  instamart: "im",
  dineout: "dineout",
};

const lastReadAt = new Map<string, number>();

/** What the user said this turn, for the confirmation gate. */
export interface TurnContext {
  userText: string;
  /**
   * Irreversible tools that have already succeeded this turn. A latch, not a
   * counter: the repeat-breaker in the agent only compares arguments, so
   * without this a second `place_food_order` spends money again.
   */
  completed?: Set<string>;
  /**
   * Order ids `confirm_order` has already been called for this turn. The tool
   * is idempotent, so a repeat is harmless to Swiggy - but it burns an
   * iteration and tempts the model to announce an outcome twice.
   */
  confirmedOrders?: Set<string>;
  /**
   * What the conversation has established (address ids, menu vs add-on ids,
   * the last cart, coupon and quoted total). Guards that need it stay quiet
   * when it is absent; the agent always supplies it.
   */
  facts?: ConversationFacts;
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
  // The merge below may add items to a cart update; the facts must remember
  // what was actually sent, not what the model asked for.
  const sent = { args };

  try {
    outcome = await runGuarded(session, userId, name, args, turn, sent);
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
  if (turn?.facts) observeToolResult(turn.facts, name, sent.args, outcome.text, outcome.isError);
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
  sent: { args: Record<string, unknown> } = { args },
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

  const facts = turn?.facts;

  const addressViolation = facts ? addressIdPrecheck(args, facts) : null;
  if (addressViolation) return blocked(addressViolation);

  // Items the merge kept in the cart on the model's behalf; noted in the result.
  let carried: string[] = [];
  if (name === "update_food_cart" && facts) {
    const addonViolation = addonIdPrecheck(args, facts);
    if (addonViolation) return blocked(addonViolation);
    const merged = mergeCartItems(args, facts);
    args = merged.args;
    carried = merged.carried;
    sent.args = args;
  }

  // report_error exists on all three servers, so an omitted domain would be
  // auto-detected against whichever copy we happened to register.
  if (name === "report_error" && !args.domain && typeof args.tool === "string") {
    const server = session.serverFor(args.tool);
    if (server) args = { ...args, domain: REPORT_DOMAIN[server] };
  }

  if (name === "create_address") {
    const violation = addressPrecheck(args, turn);
    if (typeof violation === "string") return blocked(violation);
    args = violation;
  }

  if (RATE_LIMITED_READS.has(name)) {
    const since = await msSinceLastTrack(userId, name);
    if (since != null && since < READ_COOLDOWN_MS) {
      return blocked(
        `"${name}" was checked ${Math.round(since / 1000)}s ago and may be called at most once ` +
          `every ${READ_COOLDOWN_MS / 1000}s - delivery ETAs refresh on that cadence, and the ` +
          `payment status is a long poll that must not be looped. Tell the user the last known ` +
          `status and ask them to try again in a minute. Do not call this tool again yet.`,
      );
    }
  }

  if (name === "confirm_order") {
    const orderId = typeof args.orderId === "string" ? args.orderId.trim() : "";
    if (!orderId) {
      return blocked(
        `Call rejected before it was sent: "confirm_order" needs the orderId from the ` +
          `place-order response. Re-read that result - it carries orderId and paasId - and ` +
          `call again. Never invent an order id.`,
      );
    }
    if (turn?.confirmedOrders?.has(orderId)) {
      return blocked(
        `BLOCKED - confirm_order has already run for order ${orderId} in this turn. It is ` +
          `idempotent, so a second call adds nothing: the earlier result already holds the ` +
          `outcome. Read that result and tell the user, instead of calling this tool again.`,
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
      : name === "cancel_booking"
        ? "cancels a confirmed table booking"
        : "permanently deletes a saved address";
    const summary = IRREVERSIBLE.has(name)
      ? "items, total, address, payment method"
      : name === "cancel_booking"
        ? "which booking: restaurant, date, time, guests"
        : "which address, in full";
    return blocked(
      `BLOCKED - the user has not confirmed. "${name}" ${stake} and may only run ` +
        `immediately after the user explicitly agrees. Show the final summary (${summary}) ` +
        `and ask them to reply "Yes" to confirm. ` +
        `Do not call this tool again until they do.`,
    );
  }

  if (name === "place_food_order" || name === "checkout") {
    const violation = await placementPrecheck(session, name, args, facts);
    if (violation) return blocked(violation);
  }

  if (!IRREVERSIBLE.has(name)) {
    let outcome = postProcess(name, await withRetry(() => session.callTool(name, args)));
    if (name === "update_food_cart") outcome = emptyAfterUpdate(args, outcome, facts) ?? outcome;
    if (name === "update_food_cart" && !outcome.isError && carried.length) {
      outcome = { ...outcome, text: `${outcome.text}\n\n${carriedNote(carried)}` };
    }
    if (facts && (name === "get_food_cart" || name === "update_food_cart")) {
      outcome = await reapplyCoupon(session, args, outcome, facts);
    }
    // Started only by a call that actually returned a status: a failed track
    // told the user nothing, so it must not cost them the next 10 seconds.
    if (RATE_LIMITED_READS.has(name) && !outcome.isError) {
      lastReadAt.set(`${userId}:${name}`, Date.now());
    }
    // Latched only once Swiggy answered: a 5xx that exhausted the retries has
    // told the model nothing, so the documented retry must stay open.
    if (name === "confirm_order" && !outcome.isError && typeof args.orderId === "string") {
      turn?.confirmedOrders?.add(args.orderId.trim());
    }
    return outcome;
  }

  try {
    const outcome = postProcess(name, await session.callTool(name, args));
    // Latched on success only. A domain error means the order did not go
    // through, and the ambiguous failure below is still owed the single retry
    // the ship-to-production contract allows. A PENDING_PAYMENT result counts
    // as a success here: the order exists server-side, waiting only on the
    // user's payment, so placing again would reserve a second one.
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
  const remembered = lastReadAt.get(`${userId}:${tool}`);
  const local = remembered == null ? null : Date.now() - remembered;
  // Already inside the cooldown on this instance: nothing older can change that.
  if (local != null && local < READ_COOLDOWN_MS) return local;

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
  facts: ConversationFacts | undefined,
): Promise<string | null> {
  const isFood = placementTool === "place_food_order";
  const cartTool = isFood ? "get_food_cart" : "get_cart";
  try {
    const cart = await withRetry(() => session.callTool(cartTool, cartArgs(cartTool, args)), {
      maxAttempts: 2,
    });
    if (cart.isError) return null;
    const total = extractCartTotal(tryParseJson(cart.text)) ?? totalFromText(cart.text);
    if (total == null) return null;

    const lock = facts ? priceLock(isFood, total, cart.text, facts) : null;
    if (lock) return lock;

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

/**
 * The user consents to a number. If the live cart no longer matches the last
 * total the model was shown - a coupon fell off after a cart edit, a failed
 * UPI attempt consumed it, a price changed - the placement must go back to
 * the user. A Food cart nobody has read since the last placement is refused
 * outright, because the only summary the user could have seen is stale.
 */
function priceLock(
  isFood: boolean,
  liveTotal: number,
  liveCartText: string,
  facts: ConversationFacts,
): string | null {
  const quoted = isFood ? facts.quotedTotal.food : facts.quotedTotal.instamart;
  const readTool = isFood ? "get_food_cart" : "get_cart";

  if (quoted == null) {
    if (!isFood) return null;
    return (
      `BLOCKED - no cart summary has been shown to the user for the current cart: the last ` +
      `one was consumed by an earlier placement or the cart has not been read this session. ` +
      `Call ${readTool}, show the user the items, the total (₹${liveTotal} right now) and ` +
      `whether a coupon is applied, get their "yes", and only then place.`
    );
  }

  if (Math.round(liveTotal) === Math.round(quoted)) return null;

  const liveCoupon = isFood ? (parseCartText(liveCartText)?.coupon ?? null) : null;
  const couponNote =
    isFood && facts.coupon && liveCoupon !== facts.coupon
      ? ` The coupon ${facts.coupon} is no longer applied to this cart, which is the likely cause.`
      : "";
  return (
    `BLOCKED - the live cart total is ₹${liveTotal} but the last total shown to the user was ` +
    `₹${quoted}.${couponNote} The user has not agreed to pay ₹${liveTotal}. Call ${readTool}, ` +
    `show them the updated summary and say plainly what changed, and get a fresh "yes" ` +
    `before placing.`
  );
}

/**
 * An addressId the model typed rather than copied. One changed character
 * still looks like an id, Swiggy sometimes accepts it, and a placement sent
 * with it either fails or goes to the wrong door.
 */
function addressIdPrecheck(args: Record<string, unknown>, facts: ConversationFacts): string | null {
  const raw = args.addressId ?? args.selectedAddressId;
  if (typeof raw !== "string" || !raw || !facts.addressIds.size || facts.addressIds.has(raw)) {
    return null;
  }
  const known = [...facts.addressIds];
  const meant = known.find((id) => id.length === raw.length && hammingDistance(id, raw) <= 3);
  return (
    `Call rejected before it was sent: addressId "${raw}" is not one of the user's saved ` +
    `addresses. Swiggy returned exactly: ${known.join(", ")}.` +
    (meant ? ` You probably meant ${meant}.` : "") +
    ` Copy the id byte-for-byte; if the list may have changed, call get_addresses again.`
  );
}

function hammingDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * search_menu prints a dish's id as "(ID: n)" and its add-ons as
 * "choice:n". Sent as menu_item_id, a choice id makes Swiggy answer "Cart
 * updated. Cart is empty." - the item the user asked for never lands. Seen
 * live twice in one order: the model reached for the add-on that matched the
 * dish name when the search had not returned the dish itself.
 */
function addonIdPrecheck(args: Record<string, unknown>, facts: ConversationFacts): string | null {
  const bad = cartItemsOf(args)
    .map(menuItemIdOf)
    .filter(
      (id): id is string => !!id && facts.addonChoiceIds.has(id) && !facts.menuItemIds.has(id),
    );
  if (!bad.length) return null;
  const plural = bad.length > 1;
  return (
    `Call rejected before it was sent: ${bad.join(", ")} ${plural ? "are" : "is an"} add-on ` +
    `choice id${plural ? "s" : ""} ("choice:…" in search_menu), not ${plural ? "" : "a "}menu ` +
    `item${plural ? "s" : ""}. Only the "(ID: …)" printed after a dish's price is a menu_item_id; ` +
    `an add-on belongs inside that dish's "addons" with its group id. If the dish the user asked ` +
    `for was not in the search results, do not substitute an add-on: call ` +
    `get_restaurant_menu(restaurantId, addressId) to find its exact name, search_menu with that ` +
    `name, and only then add it. If it is not on the menu at all, say so.`
  );
}

/**
 * update_food_cart replaces the whole cart, so "one more pav" sent alone
 * removes everything else (seen live: the pav bhaji vanished, delivery went
 * from free to ₹74 and the coupon fell off). Items in the last known cart
 * that the call does not mention are carried over as the model last sent
 * them - customisations included - and quantity 0 is how an item is removed.
 * Another restaurant's cart is not merged: that switch flushes by design.
 */
function mergeCartItems(
  args: Record<string, unknown>,
  facts: ConversationFacts,
): { args: Record<string, unknown>; carried: string[] } {
  const items = cartItemsOf(args);
  const kept = items.filter((item) => quantityOf(item) > 0);
  const carried: string[] = [];
  const cart = facts.cart;
  const restaurantId = args.restaurantId == null ? "" : String(args.restaurantId);
  const sameRestaurant =
    cart &&
    (cart.restaurantId
      ? cart.restaurantId === restaurantId
      : !!cart.restaurantName && cart.restaurantName === args.restaurantName);

  if (cart && sameRestaurant) {
    const mentioned = new Set(items.map(menuItemIdOf));
    for (const item of cart.items) {
      if (mentioned.has(item.id)) continue;
      kept.push(
        facts.cartPayloads.get(item.id) ?? { menu_item_id: item.id, quantity: item.quantity },
      );
      carried.push(`${item.name} x${item.quantity}`);
    }
  }
  if (kept.length === items.length && !carried.length) return { args, carried };
  return { args: { ...args, cartItems: kept }, carried };
}

function carriedNote(carried: string[]): string {
  return (
    `NOTE: ${carried.join(", ")} ${carried.length > 1 ? "were" : "was"} kept in the cart ` +
    `automatically - update_food_cart replaces the whole cart, so every item must be sent each ` +
    `time. To remove an item, send it with quantity 0.`
  );
}

/**
 * "Cart updated." followed by "Cart is empty." is Swiggy's way of saying the
 * ids were not items of this restaurant. Left as a success, the model tells
 * the user the item was added and then wonders why the cart is empty.
 */
function emptyAfterUpdate(
  args: Record<string, unknown>,
  outcome: ToolCallOutcome,
  facts: ConversationFacts | undefined,
): ToolCallOutcome | null {
  if (outcome.isError || !/^\s*Cart is empty\.?\s*$/m.test(outcome.text)) return null;
  const wanted = cartItemsOf(args).filter((item) => quantityOf(item) > 0);
  if (!wanted.length) return null;
  if (facts) {
    facts.cart = null;
    facts.cartPayloads.clear();
  }
  const ids = wanted.map((item) => menuItemIdOf(item) ?? "?").join(", ");
  return blocked(
    `Nothing was added - the cart is still empty after this update. Swiggy did not accept ` +
      `${ids} as menu item${wanted.length > 1 ? "s" : ""} of restaurant ${String(args.restaurantId)}. ` +
      `Usually the id was an add-on choice ("choice:…") or a variant rather than a dish; a ` +
      `dish's menu_item_id is the "(ID: …)" after its price in search_menu. Find the dish again ` +
      `(search_menu with its exact name, or get_restaurant_menu to browse), use that id, and ` +
      `tell the user the item has not been added yet.`,
  );
}

/**
 * A cart edit or a consumed order drops the coupon the user asked for, and
 * Swiggy says nothing - the total just goes up. Re-applied here so the model
 * quotes the right number; when Swiggy refuses, the result says so in words
 * the model cannot mistake for a discount.
 */
async function reapplyCoupon(
  session: SwiggyMcpSession,
  args: Record<string, unknown>,
  outcome: ToolCallOutcome,
  facts: ConversationFacts,
): Promise<ToolCallOutcome> {
  const code = facts.coupon;
  if (!code || outcome.isError) return outcome;
  const cart = parseCartText(outcome.text, args);
  if (!cart || cart.coupon) return outcome;
  const addressId = args.addressId;
  if (typeof addressId !== "string" || !session.tools.some((t) => t.name === "apply_food_coupon")) {
    return outcome;
  }

  let result: ToolCallOutcome;
  try {
    result = await session.callTool("apply_food_coupon", { addressId, couponCode: code });
  } catch (err) {
    result = { text: messageOf(err), isError: true };
  }
  const discount = /^\s*Discount:\s*-₹\s*([\d,]+(?:\.\d+)?)/im.exec(result.text);
  const newTotal = /^\s*New total:\s*₹\s*([\d,]+(?:\.\d+)?)/im.exec(result.text);
  const applied =
    !result.isError &&
    /applied successfully/i.test(result.text) &&
    (!discount || Number(discount[1].replace(/,/g, "")) > 0);

  if (applied && discount && newTotal) {
    const text = outcome.text.replace(
      /^(\s*)TO PAY:.*$/m,
      `$1Coupon (${code}): -₹${discount[1]}\n$1TO PAY: ₹${newTotal[1]}`,
    );
    return {
      ...outcome,
      text:
        `${text}\n\nNOTE: coupon ${code} had dropped off after the cart change and was ` +
        `re-applied automatically; the TO PAY above already includes it.`,
    };
  }
  if (applied) {
    return {
      ...outcome,
      text: `${outcome.text}\n\nCoupon ${code} was re-applied:\n${result.text}`,
    };
  }

  // Spent or invalid now: stop trying, and make the model say so.
  facts.coupon = null;
  const total = cart.toPay == null ? "the TO PAY above" : `₹${cart.toPay}`;
  return {
    ...outcome,
    text:
      `${outcome.text}\n\nNOTE: coupon ${code} was applied earlier but is NOT on this cart any ` +
      `more, and re-applying it failed: ${result.text.slice(0, 300).trim()} Tell the user ` +
      `plainly that the coupon no longer applies and that the total is ${total}. Do not claim ` +
      `any discount.`,
  };
}

/** Cart-shaped responses that can carry a coupon Swiggy has not really applied. */
const COUPON_BEARING = new Set([
  "get_food_cart",
  "update_food_cart",
  "apply_food_coupon",
  "get_cart",
  "update_cart",
  "apply_coupon",
]);

const PAYMENT_NOTE =
  "This order is NOT placed yet - payment is pending. Send the user the bridgeUrl below as a " +
  "bare link, say the order is reserved but not placed until they pay, and ask them to reply " +
  "'paid' when done. Do not call check_payment_status in this turn.";

function postProcess(name: string, outcome: ToolCallOutcome): ToolCallOutcome {
  if (outcome.isError) return outcome;

  if (COUPON_BEARING.has(name)) {
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

  // A UPI placement returns success with the order in PENDING_PAYMENT, which
  // reads exactly like a placed order unless the model looks at `status`.
  if (IRREVERSIBLE.has(name)) {
    const parsed = tryParseJson(outcome.text);
    if (isRecord(parsed) && isPendingPayment(parsed)) {
      return { ...outcome, text: JSON.stringify({ ...parsed, _payment_note: PAYMENT_NOTE }) };
    }
  }

  // Coupons are deliberately not filtered by payment method. The spec promised
  // COD-only, but live orders refuse cash and settle over UPI, so filtering out
  // online-payment coupons removed the only ones that could ever apply.

  return outcome;
}

/**
 * True when a placement result describes an order awaiting UPI payment. Food
 * carries both `status` and `normalizedStatus`; Instamart and Dineout only
 * `status`, so the normalized form is accepted only next to a `paasId`.
 */
export function isPendingPayment(value: unknown): boolean {
  let pending = false;
  const walk = (node: unknown): void => {
    if (pending) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isRecord(node)) return;
    if (node.status === "PENDING_PAYMENT") pending = true;
    else if (node.normalizedStatus === "pending" && node.paasId != null) pending = true;
    else Object.values(node).forEach(walk);
  };
  walk(value);
  return pending;
}

/**
 * Validates a create_address call and returns the args to send, or an error
 * string. Coordinates are dropped unless the user typed a pin themselves: the
 * reference page's example is 12.9716, 77.5946, which is exactly what a model
 * pastes when it believes the fields are required, and a wrong pin misdelivers
 * a real order. Omitted, the server geocodes from the address text.
 */
function addressPrecheck(
  args: Record<string, unknown>,
  turn: TurnContext | undefined,
): Record<string, unknown> | string {
  const category = args.addressCategory;
  if (category != null && !ADDRESS_CATEGORIES.includes(String(category))) {
    return (
      `Call rejected before it was sent: addressCategory "${String(category)}" is not one of ` +
      `${ADDRESS_CATEGORIES.join(", ")}. Ask the user whether it is Home, Work or Other, and ` +
      `call again with one of those exact values.`
    );
  }

  if (!("latitude" in args) && !("longitude" in args)) return args;
  if (hasCoordinatePair(turn?.userText)) return args;
  const { latitude: _lat, longitude: _lng, ...rest } = args;
  return rest;
}

/** Two decimal numbers within ±90 / ±180, separated by a comma or whitespace. */
const COORDINATE_PAIR = /(-?\d{1,3}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)/g;

export function hasCoordinatePair(text: string | undefined): boolean {
  if (!text) return false;
  for (const [, lat, lng] of text.matchAll(COORDINATE_PAIR)) {
    if (Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180) return true;
  }
  return false;
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
