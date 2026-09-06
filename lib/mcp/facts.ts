import type { ChatMessage, ToolCall } from "../llm/types";

/**
 * What the conversation has established so far, rebuilt from history at the
 * start of every turn and updated as tool results arrive. The guardrails use
 * it to catch the model acting on things Swiggy never said: an address id
 * with a typo, an add-on choice sent as a menu item, a cart update that
 * silently drops the other items, a placement at a total the user never saw.
 *
 * Swiggy's tools answer in formatted text, not JSON, so the parsers here are
 * regexes over that text. They are deliberately tolerant: a fact that fails
 * to parse only means a guard stays quiet, never that a call is wrongly
 * blocked - except the price lock, which asks for a fresh cart read instead.
 */

export interface CartItemFact {
  id: string;
  name: string;
  quantity: number;
}

export interface CartFact {
  /** From the update_food_cart call that produced this cart, when known. */
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItemFact[];
  toPay: number | null;
  /** Coupon code the cart text shows with a positive discount. */
  coupon: string | null;
}

export interface ConversationFacts {
  /** Saved address ids Swiggy has returned (get_addresses, create_address). */
  addressIds: Set<string>;
  /** Top-level menu item ids seen in search/menu/cart results. */
  menuItemIds: Set<string>;
  /** Add-on choice ids seen under menu items - never valid as menu_item_id. */
  addonChoiceIds: Set<string>;
  /** Last Food cart as Swiggy described it, null when never seen or emptied. */
  cart: CartFact | null;
  /**
   * cartItems payloads from the last successful update_food_cart, keyed by
   * menu_item_id. Carrying these over (variants and add-ons included) is what
   * keeps a "one more pav" from stripping the customisations off everything.
   */
  cartPayloads: Map<string, Record<string, unknown>>;
  /** Coupon the user had applied to the Food cart; null once it is spent. */
  coupon: string | null;
  /**
   * Last payable total the model was shown for each server's cart. Placement
   * is refused when the live cart disagrees with it. Reset on every
   * placement, so an order after a failed payment needs a fresh cart read.
   */
  quotedTotal: { food: number | null; instamart: number | null };
}

export function emptyFacts(): ConversationFacts {
  return {
    addressIds: new Set(),
    menuItemIds: new Set(),
    addonChoiceIds: new Set(),
    cart: null,
    cartPayloads: new Map(),
    coupon: null,
    quotedTotal: { food: null, instamart: null },
  };
}

/** Replays every tool round in the history, in order. */
export function buildFacts(history: ChatMessage[]): ConversationFacts {
  const facts = emptyFacts();
  const calls = new Map<string, ToolCall>();
  for (const msg of history) {
    if (msg.role === "assistant") {
      for (const call of msg.toolCalls ?? []) calls.set(call.id, call);
    } else if (msg.role === "tool_results") {
      for (const res of msg.results) {
        const call = calls.get(res.toolCallId);
        if (call)
          observeToolResult(facts, call.name, call.input, res.content, res.isError === true);
      }
    }
  }
  return facts;
}

const ADDRESS_TOOLS = new Set(["get_addresses", "create_address"]);
const MENU_TOOLS = new Set(["search_menu", "get_restaurant_menu"]);
const FOOD_CART_TOOLS = new Set(["get_food_cart", "update_food_cart", "apply_food_coupon"]);
const INSTAMART_CART_TOOLS = new Set(["get_cart", "update_cart", "apply_coupon"]);
const FOOD_PLACEMENT = "place_food_order";
const INSTAMART_PLACEMENT = "checkout";

/** Swiggy's `(ID: …)` suffix; address ids are long and mixed-case, item ids numeric. */
const ANY_ID = /\(ID:\s*([A-Za-z0-9_-]+)\)/g;
const CHOICE_ID = /\bchoice:\s*(\d+)/g;
const MONEY = String.raw`₹\s*([\d,]+(?:\.\d+)?)`;
const TO_PAY = new RegExp(String.raw`^\s*TO PAY:\s*${MONEY}`, "im");
const NEW_TOTAL = new RegExp(String.raw`^\s*New total:\s*${MONEY}`, "im");
const CART_TOTAL_HINT = new RegExp(String.raw`for this cart \(${MONEY}\)`, "i");
const COUPON_LINE = new RegExp(String.raw`^\s*Coupon \(([A-Za-z0-9_\-]+)\):\s*-${MONEY}`, "im");
const COUPON_APPLIED = /Coupon '([^']+)' applied successfully/i;
const DISCOUNT_LINE = new RegExp(String.raw`^\s*Discount:\s*-${MONEY}`, "im");
const RESTAURANT_LINE = /^\s*Restaurant:\s*(.+?)\s*$/m;
/** "  - Pav x3 — ₹57 each (subtotal: ₹57) (ID: 82273922)" */
const CART_ITEM_LINE = /^\s*-\s+(.+?)(?:\s+x(\d+))?\s+[—–-]\s+₹.*\(ID:\s*(\d+)\)\s*$/gm;

const rupees = (s: string): number => Number(s.replace(/,/g, ""));

export function parseCartText(
  text: string,
  args: Record<string, unknown> = {},
  previous: CartFact | null = null,
): CartFact | null {
  const items: CartItemFact[] = [];
  for (const m of text.matchAll(CART_ITEM_LINE)) {
    items.push({ name: m[1].trim(), quantity: m[2] ? Number(m[2]) : 1, id: m[3] });
  }
  if (!items.length) return /^\s*Cart is empty\.?\s*$/m.test(text) ? null : previous;

  const coupon = COUPON_LINE.exec(text);
  const toPay = TO_PAY.exec(text);
  const restaurantName = RESTAURANT_LINE.exec(text)?.[1] ?? previous?.restaurantName ?? null;
  const argRestaurant = typeof args.restaurantId === "string" ? args.restaurantId : null;
  const sameName = previous?.restaurantName != null && previous.restaurantName === restaurantName;
  return {
    restaurantId: argRestaurant ?? (sameName ? previous!.restaurantId : null),
    restaurantName,
    items,
    toPay: toPay ? rupees(toPay[1]) : null,
    coupon: coupon && rupees(coupon[2]) > 0 ? coupon[1] : null,
  };
}

/** Payable total in a cart-shaped text result, or null. */
export function totalFromText(text: string): number | null {
  const m = TO_PAY.exec(text) ?? NEW_TOTAL.exec(text) ?? CART_TOTAL_HINT.exec(text);
  return m ? rupees(m[1]) : null;
}

/**
 * Folds one model-visible tool result into the facts. Errors and blocked
 * calls teach nothing, except that a rejected coupon is not applied.
 */
export function observeToolResult(
  facts: ConversationFacts,
  name: string,
  args: Record<string, unknown>,
  text: string,
  isError: boolean,
): void {
  if (isError) return;

  if (ADDRESS_TOOLS.has(name)) {
    for (const m of text.matchAll(ANY_ID)) facts.addressIds.add(m[1]);
    for (const m of text.matchAll(/"(?:id|addressId)"\s*:\s*"([A-Za-z0-9_-]{8,})"/g)) {
      facts.addressIds.add(m[1]);
    }
    return;
  }

  if (MENU_TOOLS.has(name)) {
    for (const m of text.matchAll(ANY_ID)) facts.menuItemIds.add(m[1]);
    for (const m of text.matchAll(CHOICE_ID)) facts.addonChoiceIds.add(m[1]);
    return;
  }

  if (name === "flush_food_cart") {
    resetFoodCart(facts);
    return;
  }

  if (FOOD_CART_TOOLS.has(name)) {
    const cart = parseCartText(text, args, facts.cart);
    if (cart) {
      for (const item of cart.items) facts.menuItemIds.add(item.id);
      if (
        facts.cart &&
        cart.restaurantId &&
        facts.cart.restaurantId &&
        cart.restaurantId !== facts.cart.restaurantId
      ) {
        // A new restaurant flushed the old cart, coupon included.
        facts.cartPayloads.clear();
        facts.coupon = null;
      }
      if (cart.coupon) facts.coupon = cart.coupon;
    } else if (/Cart is empty/i.test(text)) {
      facts.cartPayloads.clear();
    }
    facts.cart = cart;

    if (name === "update_food_cart" && cart) rememberPayloads(facts, args, cart);

    if (name === "apply_food_coupon") {
      const applied = COUPON_APPLIED.exec(text);
      const discount = DISCOUNT_LINE.exec(text);
      if (applied && (!discount || rupees(discount[1]) > 0)) facts.coupon = applied[1];
    }

    const total = totalFromText(text);
    if (total != null) facts.quotedTotal.food = total;
    return;
  }

  if (INSTAMART_CART_TOOLS.has(name)) {
    const total = totalFromText(text);
    if (total != null) facts.quotedTotal.instamart = total;
    return;
  }

  if (name === "get_payment_options") {
    const total = totalFromText(text);
    if (total == null) return;
    // Food carts carry an addressId; the same tool on Instamart does too, so
    // whichever cart is live gets the quote. Both is harmless: placement
    // compares against the server the placement tool belongs to.
    if (facts.cart) facts.quotedTotal.food = total;
    else facts.quotedTotal.instamart = total;
    return;
  }

  if (name === FOOD_PLACEMENT) {
    // Placed or reserved either way: the cart is consumed, the coupon spent.
    resetFoodCart(facts);
    return;
  }

  if (name === INSTAMART_PLACEMENT || name === "clear_cart") {
    facts.quotedTotal.instamart = null;
  }
}

function resetFoodCart(facts: ConversationFacts): void {
  facts.cart = null;
  facts.cartPayloads.clear();
  facts.coupon = null;
  facts.quotedTotal.food = null;
}

/** Keeps the payload of every item now in the cart, as the model last sent it. */
function rememberPayloads(
  facts: ConversationFacts,
  args: Record<string, unknown>,
  cart: CartFact,
): void {
  const inCart = new Set(cart.items.map((i) => i.id));
  for (const item of cartItemsOf(args)) {
    const id = menuItemIdOf(item);
    if (id && inCart.has(id)) facts.cartPayloads.set(id, item);
  }
  for (const id of [...facts.cartPayloads.keys()]) {
    if (!inCart.has(id)) facts.cartPayloads.delete(id);
  }
}

export function cartItemsOf(args: Record<string, unknown>): Record<string, unknown>[] {
  const items = args.cartItems;
  if (!Array.isArray(items)) return [];
  return items.filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
}

export function menuItemIdOf(item: Record<string, unknown>): string | null {
  const id = item.menu_item_id ?? item.menuItemId ?? item.itemId ?? item.id;
  return id == null ? null : String(id);
}

export function quantityOf(item: Record<string, unknown>): number {
  const q = Number(item.quantity);
  return Number.isFinite(q) ? q : 1;
}
