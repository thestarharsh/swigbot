import { describe, expect, it, vi } from "vitest";
import {
  executeGuardedTool,
  extractCartTotal,
  filterOnlineOnlyCoupons,
  isConfirmation,
  missingRequiredArgs,
  scrubPhantomCoupon,
  tryParseJson,
} from "../lib/mcp/guardrails";
import type { SwiggyMcpSession, ToolCallOutcome } from "../lib/mcp/session";

type Handler = (args: Record<string, unknown>) => Promise<ToolCallOutcome> | ToolCallOutcome;

function fakeSession(
  handlers: Record<string, Handler>,
  schemas: Record<string, Record<string, unknown>> = {},
): SwiggyMcpSession {
  return {
    serverFor: () => "food",
    tools: Object.keys(handlers).map((name) => ({
      name,
      inputSchema: schemas[name] ?? { type: "object" },
    })),
    callTool: async (name: string, args: Record<string, unknown>) => {
      const handler = handlers[name];
      if (!handler) throw new Error(`no handler for ${name}`);
      return handler(args);
    },
  } as unknown as SwiggyMcpSession;
}

/** Placement guardrails assume the user just said yes; the gate has its own tests. */
const CONFIRMED = { userText: "yes" };

const ok = (data: unknown): ToolCallOutcome => ({
  text: JSON.stringify(data),
  isError: false,
  raw: data,
});

let nextUserId = 1000;

describe("Problem 6 - ₹1000 food cart hard cap", () => {
  it("blocks place_food_order when the fresh cart total exceeds ₹1000", async () => {
    const place = vi.fn();
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 1240, items: [] } }),
      place_food_order: place,
    });
    const result = await executeGuardedTool(session, nextUserId++, "place_food_order", {}, CONFIRMED);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("₹1000");
    expect(place).not.toHaveBeenCalled();
  });

  it("allows placement when the total is within the cap", async () => {
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 640 } }),
      place_food_order: () => ok({ orderId: "ord_1", status: "PLACED" }),
    });
    const result = await executeGuardedTool(session, nextUserId++, "place_food_order", {}, CONFIRMED);
    expect(result.isError).toBe(false);
    expect(result.text).toContain("ord_1");
  });

  it("forwards addressId to the cart read, which get_food_cart requires", async () => {
    // Called with {}, Swiggy rejects the read and the cap stops being enforced.
    const seen: Record<string, unknown>[] = [];
    const session = fakeSession({
      get_food_cart: (args) => {
        seen.push(args);
        if (!args.addressId) return { text: "addressId is required", isError: true, raw: null };
        return ok({ cart: { bill_total: 1500 } });
      },
      place_food_order: () => ok({ orderId: "should_not_happen" }),
    });
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      { addressId: "addr_1" },
      CONFIRMED,
    );
    expect(seen[0]).toEqual({ addressId: "addr_1" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("₹1000");
  });
});

describe("Problem 18 - ₹99 Instamart minimum", () => {
  it("blocks checkout under the minimum", async () => {
    const checkout = vi.fn();
    const session = fakeSession({
      get_cart: () => ok({ bill: { totalAmount: 64 } }),
      checkout,
    });
    const result = await executeGuardedTool(session, nextUserId++, "checkout", {}, CONFIRMED);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("₹99");
    expect(checkout).not.toHaveBeenCalled();
  });
});

describe("Problem 4 - placement is not idempotent (check-then-retry)", () => {
  it("does not blind-retry; checks order status and reports back", async () => {
    const place = vi
      .fn()
      .mockRejectedValue(new Error("HTTP 502 Bad Gateway"));
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 500 } }),
      place_food_order: place,
      get_food_orders: () => ok({ orders: [{ orderId: "ord_9", status: "PLACED" }] }),
    });
    const result = await executeGuardedTool(session, nextUserId++, "place_food_order", {}, CONFIRMED);
    expect(place).toHaveBeenCalledTimes(1); // never blind-retried
    expect(result.isError).toBe(true);
    expect(result.text).toContain("MAY OR MAY NOT");
    expect(result.text).toContain("ord_9");
  }, 15_000);
});

describe("Problem 15 - tracking poll rate", () => {
  it("refuses a second track call within 10 seconds", async () => {
    const userId = nextUserId++;
    const session = fakeSession({
      track_food_order: () => ok({ status: "OUT_FOR_DELIVERY", etaMinutes: 12 }),
    });
    const first = await executeGuardedTool(session, userId, "track_food_order", { orderId: "o1" });
    expect(first.isError).toBe(false);
    const second = await executeGuardedTool(session, userId, "track_food_order", { orderId: "o1" });
    expect(second.isError).toBe(true);
    expect(second.text).toContain("Do not call this tool again yet");
  });
});

describe("Problem 7 - coupon auto-suggest confusion", () => {
  it("strips coupon_applied when coupon_discount is 0", () => {
    const cart = {
      offers: { coupon_applied: "TRYNEW", coupon_discount: 0 },
      bill_total: 400,
    };
    expect(scrubPhantomCoupon(cart)).toBe(true);
    expect(cart.offers).not.toHaveProperty("coupon_applied");
  });

  it("keeps genuinely applied coupons", () => {
    const cart = { offers: { coupon_applied: "TRYNEW", coupon_discount: 75 } };
    expect(scrubPhantomCoupon(cart)).toBe(false);
    expect(cart.offers.coupon_applied).toBe("TRYNEW");
  });

  it("scrubs inside get_food_cart tool results end-to-end", async () => {
    const session = fakeSession({
      get_food_cart: () =>
        ok({ offers: { coupon_applied: "WELCOME50", coupon_discount: 0 }, total: 300 }),
    });
    const result = await executeGuardedTool(session, nextUserId++, "get_food_cart", {});
    expect(result.text).not.toContain("WELCOME50");
  });
});

describe("coupons are no longer filtered by payment method", () => {
  it("keeps online-payment coupons, because live orders settle over UPI", async () => {
    // COD is refused in practice, so stripping these removed the only coupons
    // that could apply.
    const session = fakeSession({
      fetch_food_coupons: () =>
        ok({
          coupons: [
            { code: "CODSAVE", requiresOnlinePayment: false },
            { code: "UPIONLY", requiresOnlinePayment: true },
          ],
        }),
    });
    const result = await executeGuardedTool(session, nextUserId++, "fetch_food_coupons", {});
    expect(result.text).toContain("CODSAVE");
    expect(result.text).toContain("UPIONLY");
  });

  it("filterOnlineOnlyCoupons handles snake_case flags", () => {
    const data = { coupons: [{ code: "A", requires_online_payment: true }, { code: "B" }] };
    expect(filterOnlineOnlyCoupons(data)).toBe(1);
    expect(data.coupons).toHaveLength(1);
    expect(data.coupons[0].code).toBe("B");
  });
});

describe("tolerant extractors", () => {
  it("extractCartTotal finds totals under varied key styles", () => {
    expect(extractCartTotal({ bill_total: 420 })).toBe(420);
    expect(extractCartTotal({ data: { grandTotal: 999 } })).toBe(999);
    expect(extractCartTotal({ cart: { totalAmount: "649" } })).toBe(649);
    expect(extractCartTotal({ items: [{ item_total: 100 }, { item_total: 200 }], total_to_pay: 300 })).toBe(300);
    expect(extractCartTotal({ items: [] })).toBeNull();
  });

  it("tryParseJson only parses JSON-looking text", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson("Your cart is empty")).toBeNull();
    expect(tryParseJson("{broken")).toBeNull();
  });
});

describe("confirmation gate on irreversible tools", () => {
  it("refuses to place an order the user never confirmed", async () => {
    const place = vi.fn();
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 400 } }),
      place_food_order: place,
    });
    const result = await executeGuardedTool(session, nextUserId++, "place_food_order", {}, {
      userText: "add a garlic naan too",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("has not confirmed");
    expect(place).not.toHaveBeenCalled();
  });

  it("refuses when no turn context is supplied at all", async () => {
    const book = vi.fn();
    const session = fakeSession({ book_table: book });
    const result = await executeGuardedTool(session, nextUserId++, "book_table", { slotId: "s1" });
    expect(result.isError).toBe(true);
    expect(book).not.toHaveBeenCalled();
  });

  it("proceeds once the user says yes", async () => {
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 400 } }),
      place_food_order: () => ok({ orderId: "ord_7" }),
    });
    const result = await executeGuardedTool(session, nextUserId++, "place_food_order", {}, {
      userText: "Yes ✅",
    });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("ord_7");
  });

  it("does not gate reads", async () => {
    const session = fakeSession({ get_addresses: () => ok({ addresses: [] }) });
    const result = await executeGuardedTool(session, nextUserId++, "get_addresses", {});
    expect(result.isError).toBe(false);
  });

  it("accepts affirmatives across phrasings and rejects non-answers", () => {
    for (const yes of ["yes", "Yes ✅", "yep", "ok", "confirm", "go ahead", "place the order", "haan", "👍", "kar do"]) {
      expect(isConfirmation(yes), yes).toBe(true);
    }
    for (const no of ["", "no", "not yet", "wait", "add fries", "what's the total?", "cancel", undefined]) {
      expect(isConfirmation(no), String(no)).toBe(false);
    }
  });

  it("does not read a long sentence that merely starts with ok as consent", () => {
    expect(isConfirmation("ok so what other restaurants are open near me right now")).toBe(false);
  });
});

describe("pre-call argument validation", () => {
  it("rejects a call missing a required argument without hitting Swiggy", async () => {
    const search = vi.fn();
    const session = fakeSession(
      { search_restaurants: search },
      { search_restaurants: { type: "object", required: ["query", "addressId"] } },
    );
    const result = await executeGuardedTool(session, nextUserId++, "search_restaurants", {
      query: "biryani",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("addressId");
    expect(result.text).toContain("Never invent an ID");
    expect(search).not.toHaveBeenCalled();
  });

  it("allows the call once every required argument is present", async () => {
    const session = fakeSession(
      { search_restaurants: () => ok({ restaurants: [] }) },
      { search_restaurants: { type: "object", required: ["query", "addressId"] } },
    );
    const result = await executeGuardedTool(session, nextUserId++, "search_restaurants", {
      query: "biryani",
      addressId: "addr_1",
    });
    expect(result.isError).toBe(false);
  });

  it("treats empty strings and nulls as missing", () => {
    const schema = { type: "object", required: ["addressId"] };
    expect(missingRequiredArgs(schema, {})).toEqual(["addressId"]);
    expect(missingRequiredArgs(schema, { addressId: "" })).toEqual(["addressId"]);
    expect(missingRequiredArgs(schema, { addressId: null })).toEqual(["addressId"]);
    expect(missingRequiredArgs(schema, { addressId: "a1" })).toEqual([]);
    expect(missingRequiredArgs({ type: "object" }, {})).toEqual([]);
  });
});

describe("hallucinated tool names", () => {
  it("returns a corrective message with a suggestion", async () => {
    const session = fakeSession({ get_addresses: () => ok({}) });
    const result = await executeGuardedTool(session, nextUserId++, "get_address", {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No tool named");
    expect(result.text).toContain("get_addresses");
  });
});
