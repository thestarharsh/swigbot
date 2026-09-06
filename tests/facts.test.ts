import { describe, expect, it } from "vitest";
import {
  buildFacts,
  emptyFacts,
  observeToolResult,
  parseCartText,
  totalFromText,
} from "../lib/mcp/facts";
import type { ChatMessage } from "../lib/llm/types";

// Texts below are what Swiggy actually returned during the 2026-09-06 order.
const ADDRESSES = `Found 3 saved addresses (page 1 of 1, showing 3):
1. [PG] Harsh: Flat 201, Sus, Pune (ID: d7rfisolsntnm6jn7big__ARsUSQRlXSo8aW2qXzR0g5)
2. [Work] Harsh: Baner, Pune (ID: curirlakqhtt6ocpui90__ARshhQRlqeIvJ5KTp3AD99)

The saved addresses are ranked for display.`;

const MENU = `Found 10 menu items for "Cheese Pav Bhaji":
1. Cheese Pav Bhaji — ₹219 | Veg | 4.3★ (13) (ID: 80961091)
   Addons (Desi Meal Bowls): [Paneer Tikka Rice Bowl ₹349 (group:175219817, choice:125734560)]
   Addons (Special Biryani's): [Paneer Peri Peri Tikka Biryani With Boondi Raita ₹309 (group:175219820, choice:125734545)]
3. Pav — ₹19 | Veg | 4.4★ (31) (ID: 82273922)
6. 2 Pc Hara Bhara Kabab — ₹40 | Veg (ID: 119529279)`;

const CART_TWO = `Cart updated.
Restaurant: Veg Sutra
Items (2):
  - Cheese Pav Bhaji — ₹219 (ID: 80961091)
  - Pav x2 — ₹38 each (subtotal: ₹38) (ID: 82273922)

Item total: ₹257
Delivery: FREE
Taxes & charges: ₹51.83
TO PAY: ₹309

Cart widget is displayed. Wait for the user to review and confirm.`;

const CART_COUPON = `Restaurant: Veg Sutra
Items (1):
  - Paneer Tikka Biryani Bowl — ₹164 (ID: 94471288)

Item total: ₹289
Delivery: FREE
Taxes & charges: ₹53.43
Coupon (ORDERON): -₹125
TO PAY: ₹217`;

const ADDRESS_ARGS = { addressId: "d7rfisolsntnm6jn7big__ARsUSQRlXSo8aW2qXzR0g5" };
const CART_ARGS = { ...ADDRESS_ARGS, restaurantId: "458195", restaurantName: "Veg Sutra" };

describe("parseCartText", () => {
  it("reads items, quantities, ids, total and coupon from Swiggy's cart text", () => {
    const cart = parseCartText(CART_TWO, CART_ARGS);
    expect(cart).toEqual({
      restaurantId: "458195",
      restaurantName: "Veg Sutra",
      items: [
        { id: "80961091", name: "Cheese Pav Bhaji", quantity: 1 },
        { id: "82273922", name: "Pav", quantity: 2 },
      ],
      toPay: 309,
      coupon: null,
    });
    expect(parseCartText(CART_COUPON)?.coupon).toBe("ORDERON");
    expect(parseCartText(CART_COUPON)?.toPay).toBe(217);
  });

  it("returns null for an empty cart and keeps the previous cart for unrelated text", () => {
    const prev = parseCartText(CART_TWO, CART_ARGS);
    expect(parseCartText("Cart updated.\nCart is empty.\n\nCart widget is displayed.")).toBeNull();
    expect(parseCartText("Coupon 'X' applied successfully!\nNew total: ₹204", {}, prev)).toBe(prev);
  });

  it("totalFromText accepts the three ways Swiggy states a payable total", () => {
    expect(totalFromText(CART_TWO)).toBe(309);
    expect(
      totalFromText("Coupon 'ORDERON' applied successfully!\nDiscount: -₹125\nNew total: ₹204"),
    ).toBe(204);
    expect(totalFromText("Found 8 UPI option(s) + Cash on Delivery for this cart (₹204).")).toBe(
      204,
    );
    expect(totalFromText("Found 0 coupons")).toBeNull();
  });
});

describe("observeToolResult", () => {
  it("learns address ids, and menu item ids separately from add-on choice ids", () => {
    const facts = emptyFacts();
    observeToolResult(facts, "get_addresses", {}, ADDRESSES, false);
    observeToolResult(facts, "search_menu", ADDRESS_ARGS, MENU, false);
    expect([...facts.addressIds]).toEqual([
      "d7rfisolsntnm6jn7big__ARsUSQRlXSo8aW2qXzR0g5",
      "curirlakqhtt6ocpui90__ARshhQRlqeIvJ5KTp3AD99",
    ]);
    expect(facts.menuItemIds.has("80961091")).toBe(true);
    expect(facts.addonChoiceIds.has("125734560")).toBe(true);
    expect(facts.menuItemIds.has("125734560")).toBe(false);
    // An add-on that Swiggy also lists as a dish is a legitimate menu item.
    expect(facts.menuItemIds.has("119529279")).toBe(true);
  });

  it("tracks the cart, the payloads that built it, the coupon and the quoted total", () => {
    const facts = emptyFacts();
    const payload = { menu_item_id: "80961091", quantity: 1, addons: [{ choice_id: "x" }] };
    observeToolResult(
      facts,
      "update_food_cart",
      { ...CART_ARGS, cartItems: [payload, { menu_item_id: "82273922", quantity: 2 }] },
      CART_TWO,
      false,
    );
    expect(facts.cart?.items.map((i) => i.id)).toEqual(["80961091", "82273922"]);
    expect(facts.cartPayloads.get("80961091")).toBe(payload);
    expect(facts.quotedTotal.food).toBe(309);

    observeToolResult(
      facts,
      "apply_food_coupon",
      { ...ADDRESS_ARGS, couponCode: "ORDERON" },
      "Coupon 'ORDERON' applied successfully!\nDiscount: -₹125\nNew total: ₹184",
      false,
    );
    expect(facts.coupon).toBe("ORDERON");
    expect(facts.quotedTotal.food).toBe(184);

    observeToolResult(
      facts,
      "get_payment_options",
      ADDRESS_ARGS,
      "8 options for this cart (₹184).",
      false,
    );
    expect(facts.quotedTotal.food).toBe(184);
  });

  it("forgets the cart, coupon and quote once an order is placed or reserved", () => {
    const facts = emptyFacts();
    observeToolResult(facts, "get_food_cart", ADDRESS_ARGS, CART_COUPON, false);
    expect(facts.coupon).toBe("ORDERON");
    observeToolResult(
      facts,
      "place_food_order",
      ADDRESS_ARGS,
      "⏳ PENDING_PAYMENT — not placed yet",
      false,
    );
    expect(facts.cart).toBeNull();
    expect(facts.coupon).toBeNull();
    expect(facts.quotedTotal.food).toBeNull();
  });

  it("ignores errors: a rejected coupon is not remembered as applied", () => {
    const facts = emptyFacts();
    observeToolResult(facts, "apply_food_coupon", {}, "Coupon 'BAD' applied successfully!", true);
    expect(facts.coupon).toBeNull();
  });
});

describe("buildFacts", () => {
  it("replays tool rounds from history, pairing each result with its call", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "options?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "a", name: "get_addresses", input: {} }],
      },
      { role: "tool_results", results: [{ toolCallId: "a", content: ADDRESSES }] },
      { role: "user", content: "pav bhaji" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "b", name: "search_menu", input: ADDRESS_ARGS },
          { id: "c", name: "update_food_cart", input: { ...CART_ARGS, cartItems: [] } },
        ],
      },
      {
        role: "tool_results",
        results: [
          { toolCallId: "b", content: MENU },
          { toolCallId: "c", content: CART_TWO },
        ],
      },
    ];
    const facts = buildFacts(history);
    expect(facts.addressIds.size).toBe(2);
    expect(facts.addonChoiceIds.has("125734545")).toBe(true);
    expect(facts.cart?.restaurantId).toBe("458195");
    expect(facts.quotedTotal.food).toBe(309);
  });
});
