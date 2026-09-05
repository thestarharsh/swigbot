import { describe, expect, it, vi } from "vitest";
import {
  dropPaidSlots,
  executeGuardedTool,
  extractCartTotal,
  isConfirmation,
  missingRequiredArgs,
  scrubPhantomCoupon,
  tryParseJson,
} from "../lib/mcp/guardrails";
import type { SwiggyMcpSession, ToolCallOutcome } from "../lib/mcp/session";

// Every real wait in this file - the placement check delay and lib/db's own
// retry of the deliberately unreachable test database - goes through this.
vi.mock("../lib/util/sleep", () => ({ sleep: () => Promise.resolve() }));

type Handler = (args: Record<string, unknown>) => Promise<ToolCallOutcome> | ToolCallOutcome;

function fakeSession(
  handlers: Record<string, Handler>,
  schemas: Record<string, Record<string, unknown>> = {},
  serverFor: (tool: string) => string | undefined = () => "food",
): SwiggyMcpSession {
  return {
    serverFor,
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

/** Placement tests assume a yes; the gate has its own tests below. */
const CONFIRMED = { userText: "yes" };

const ok = (data: unknown): ToolCallOutcome => ({
  text: JSON.stringify(data),
  isError: false,
});

let nextUserId = 1000;

describe("Problem 6 - ₹1000 food cart hard cap", () => {
  it("blocks place_food_order when the fresh cart total exceeds ₹1000", async () => {
    const place = vi.fn();
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 1240, items: [] } }),
      place_food_order: place,
    });
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      {},
      CONFIRMED,
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("₹1000");
    expect(place).not.toHaveBeenCalled();
  });

  it("allows placement when the total is within the cap", async () => {
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 640 } }),
      place_food_order: () => ok({ orderId: "ord_1", status: "PLACED" }),
    });
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      {},
      CONFIRMED,
    );
    expect(result.isError).toBe(false);
    expect(result.text).toContain("ord_1");
  });

  it("forwards addressId to the cart read, which get_food_cart requires", async () => {
    // Called with {}, Swiggy rejects the read and the cap stops being enforced.
    const seen: Record<string, unknown>[] = [];
    const session = fakeSession({
      get_food_cart: (args) => {
        seen.push(args);
        if (!args.addressId) return { text: "addressId is required", isError: true };
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
    const place = vi.fn().mockRejectedValue(new Error("HTTP 502 Bad Gateway"));
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 500 } }),
      place_food_order: place,
      get_food_orders: () => ok({ orders: [{ orderId: "ord_9", status: "PLACED" }] }),
    });
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      {},
      CONFIRMED,
    );
    expect(place).toHaveBeenCalledTimes(1); // never blind-retried
    expect(result.isError).toBe(true);
    expect(result.text).toContain("MAY OR MAY NOT");
    expect(result.text).toContain("ord_9");
  });

  it("checks Instamart with activeOnly, so 15 days of history cannot mask the answer", async () => {
    const seen: Record<string, unknown>[] = [];
    const session = fakeSession({
      get_cart: () => ok({ bill: { total_to_pay: 500 } }),
      checkout: vi.fn().mockRejectedValue(new Error("HTTP 502 Bad Gateway")),
      get_orders: (args) => {
        seen.push(args);
        return ok({ orders: [] });
      },
    });
    const result = await executeGuardedTool(session, nextUserId++, "checkout", {}, CONFIRMED);
    expect(seen).toEqual([{ activeOnly: true }]);
    expect(result.text).toContain("MAY OR MAY NOT");
  });

  it("tells the model a failed book_table is unverifiable, and never calls get_booking_status", async () => {
    // get_booking_status needs an orderId a failed booking never returned, and
    // Dineout has no list-bookings tool, so the old check could only ever fail.
    const status = vi.fn();
    const session = fakeSession(
      {
        book_table: vi.fn().mockRejectedValue(new Error("HTTP 503 Service Unavailable")),
        get_booking_status: status,
      },
      { get_booking_status: { type: "object", required: ["orderId"] } },
    );
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "book_table",
      { slotId: "s1" },
      CONFIRMED,
    );
    expect(status).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.text).toContain("MAY OR MAY NOT");
    expect(result.text).toContain("Do NOT retry");
    expect(result.text).toContain("Swiggy");
  });

  it("reports the check as unverifiable rather than sending it with a missing argument", async () => {
    const orders = vi.fn();
    const session = fakeSession(
      {
        get_food_cart: () => ok({ cart: { bill_total: 500 } }),
        place_food_order: vi.fn().mockRejectedValue(new Error("HTTP 502 Bad Gateway")),
        get_food_orders: orders,
      },
      { get_food_orders: { type: "object", required: ["addressId"] } },
    );
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      {},
      CONFIRMED,
    );
    expect(orders).not.toHaveBeenCalled();
    expect(result.text).toContain("cannot verify");
    expect(result.text).toContain("addressId");
  });
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

  it("does not spend the cooldown on a call that failed", async () => {
    // The old code remembered the attempt before making it, so one upstream
    // error locked the user out of tracking for ten seconds.
    const userId = nextUserId++;
    const track = vi
      .fn()
      .mockResolvedValueOnce({ text: "order not found", isError: true })
      .mockResolvedValueOnce(ok({ status: "OUT_FOR_DELIVERY" }));
    const session = fakeSession({ track_food_order: track });

    const failed = await executeGuardedTool(session, userId, "track_food_order", { orderId: "o1" });
    expect(failed.isError).toBe(true);
    const retry = await executeGuardedTool(session, userId, "track_food_order", { orderId: "o1" });
    expect(retry.isError).toBe(false);
    expect(track).toHaveBeenCalledTimes(2);
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
    // COD is refused in practice, so stripping these removed the only
    // coupons that could apply.
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
});

describe("tolerant extractors", () => {
  it("extractCartTotal finds totals under varied key styles", () => {
    expect(extractCartTotal({ bill_total: 420 })).toBe(420);
    expect(extractCartTotal({ data: { grandTotal: 999 } })).toBe(999);
    expect(extractCartTotal({ cart: { totalAmount: "649" } })).toBe(649);
    expect(
      extractCartTotal({ items: [{ item_total: 100 }, { item_total: 200 }], total_to_pay: 300 }),
    ).toBe(300);
    expect(extractCartTotal({ items: [] })).toBeNull();
  });

  it("extractCartTotal prefers the payable total over line items and subtotals", () => {
    // Taking the maximum blocked every discounted order: ₹1100 of items less
    // ₹200 is a ₹900 cart, well inside the cap.
    expect(extractCartTotal({ item_total: 1100, discount: 200, grand_total: 900 })).toBe(900);
    expect(extractCartTotal({ items: [{ total: 1200 }], bill: { total_to_pay: 450 } })).toBe(450);
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
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      {},
      {
        userText: "add a garlic naan too",
      },
    );
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
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      {},
      {
        userText: "Yes ✅",
      },
    );
    expect(result.isError).toBe(false);
    expect(result.text).toContain("ord_7");
  });

  it("does not gate reads", async () => {
    const session = fakeSession({ get_addresses: () => ok({ addresses: [] }) });
    const result = await executeGuardedTool(session, nextUserId++, "get_addresses", {});
    expect(result.isError).toBe(false);
  });

  it("accepts affirmatives across phrasings and rejects non-answers", () => {
    for (const yes of [
      "yes",
      "Yes ✅",
      "yep",
      "ok",
      "confirm",
      "go ahead",
      "place the order",
      "haan",
      "👍",
      "kar do",
      "haan bhai kar do",
      "theek hai",
    ]) {
      expect(isConfirmation(yes), yes).toBe(true);
    }
    for (const no of [
      "",
      "no",
      "not yet",
      "wait",
      "add fries",
      "what's the total?",
      "cancel",
      undefined,
    ]) {
      expect(isConfirmation(no), String(no)).toBe(false);
    }
  });

  it("refuses conditional, deferred and retracted consent", () => {
    // Each of these opened the gate before the veto check existed, and every
    // one of them means "not yet".
    for (const no of [
      "yes but change the address first",
      "yes, but remove the coke",
      "ok wait",
      "yes no",
      "go find me biryani",
      "done, now show me the menu",
      "sure, but what's the delivery time?",
      "ok so what other restaurants are open",
      "ok so what other restaurants are open near me right now",
    ]) {
      expect(isConfirmation(no), no).toBe(false);
    }
  });
});

describe("one successful placement per turn", () => {
  /** What lib/agent.ts builds once per turn and reuses across iterations. */
  const turn = () => ({ userText: "yes", completed: new Set<string>() });

  it("refuses a second placement after the first succeeded, even with different args", async () => {
    // The agent's repeat-breaker only compares arguments, so it lets an
    // identical call through twice and a tweaked one through indefinitely.
    const place = vi.fn().mockResolvedValue(ok({ orderId: "ord_1", status: "PLACED" }));
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 400 } }),
      place_food_order: place,
    });
    const userId = nextUserId++;
    const ctx = turn();

    const first = await executeGuardedTool(session, userId, "place_food_order", {}, ctx);
    expect(first.isError).toBe(false);

    const second = await executeGuardedTool(
      session,
      userId,
      "place_food_order",
      { addressId: "addr_1" },
      ctx,
    );
    expect(second.isError).toBe(true);
    expect(second.text).toContain("already completed");
    expect(place).toHaveBeenCalledTimes(1);
  });

  it("still allows the single retry a domain error leaves open", async () => {
    // A domain failure means nothing was placed; latching it would strand the
    // user after a fixable problem.
    const place = vi
      .fn()
      .mockResolvedValueOnce({ text: "item out of stock", isError: true })
      .mockResolvedValueOnce(ok({ orderId: "ord_2" }));
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 400 } }),
      place_food_order: place,
    });
    const userId = nextUserId++;
    const ctx = turn();

    expect((await executeGuardedTool(session, userId, "place_food_order", {}, ctx)).isError).toBe(
      true,
    );
    const retry = await executeGuardedTool(session, userId, "place_food_order", {}, ctx);
    expect(retry.isError).toBe(false);
    expect(retry.text).toContain("ord_2");
  });

  it("latches per turn, so a later turn can order again", async () => {
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 400 } }),
      place_food_order: () => ok({ orderId: "ord_3" }),
    });
    const userId = nextUserId++;
    expect(
      (await executeGuardedTool(session, userId, "place_food_order", {}, turn())).isError,
    ).toBe(false);
    const nextTurn = await executeGuardedTool(session, userId, "place_food_order", {}, turn());
    expect(nextTurn.isError).toBe(false);
  });

  it("does not latch reads", async () => {
    const session = fakeSession({ get_addresses: () => ok({ addresses: [] }) });
    const userId = nextUserId++;
    const ctx = turn();
    await executeGuardedTool(session, userId, "get_addresses", {}, ctx);
    const again = await executeGuardedTool(session, userId, "get_addresses", {}, ctx);
    expect(again.isError).toBe(false);
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

describe("Problem 13 - only free Dineout slots reach the model", () => {
  it("removes paid deals from get_available_slots and says how many", async () => {
    const session = fakeSession({
      get_available_slots: () =>
        ok({
          slots: [
            {
              displayTime: "7:00 PM",
              deals: [
                { title: "Free table", isFree: true, bookingPrice: 0 },
                { title: "Prime deal", isFree: false, bookingPrice: 0 },
                { title: "Paid deal", is_free: true, booking_price: 199 },
              ],
            },
          ],
        }),
    });
    const result = await executeGuardedTool(session, nextUserId++, "get_available_slots", {});
    expect(result.text).toContain("Free table");
    expect(result.text).not.toContain("Prime deal");
    expect(result.text).not.toContain("Paid deal");
    expect(result.text).toContain("2 paid/prime slots were hidden");
  });

  it("leaves an all-free response untouched", () => {
    const payload = { slots: [{ deals: [{ isFree: true, bookingPrice: 0 }] }] };
    expect(dropPaidSlots(payload)).toBe(0);
    expect(payload).not.toHaveProperty("_paid_slots_hidden");
  });
});

describe("delete_address is destructive", () => {
  it("refuses without the user's own confirmation, then allows it", async () => {
    const del = vi.fn().mockResolvedValue(ok({ deleted: true }));
    const session = fakeSession({ delete_address: del });
    const userId = nextUserId++;

    const refused = await executeGuardedTool(
      session,
      userId,
      "delete_address",
      { addressId: "a1" },
      { userText: "get rid of my old office address" },
    );
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("has not confirmed");
    expect(del).not.toHaveBeenCalled();

    const allowed = await executeGuardedTool(
      session,
      userId,
      "delete_address",
      { addressId: "a1" },
      { userText: "yes" },
    );
    expect(allowed.isError).toBe(false);
  });

  it("is not latched: it is neither a placement nor check-then-retried", async () => {
    const session = fakeSession({ delete_address: () => ok({ deleted: true }) });
    const ctx = { userText: "yes", completed: new Set<string>() };
    const userId = nextUserId++;
    await executeGuardedTool(session, userId, "delete_address", { addressId: "a1" }, ctx);
    const again = await executeGuardedTool(
      session,
      userId,
      "delete_address",
      { addressId: "a2" },
      ctx,
    );
    expect(again.isError).toBe(false);
  });
});

describe("report_error routing", () => {
  it("injects the domain of the server that owns the failing tool", async () => {
    const seen: Record<string, unknown>[] = [];
    const session = fakeSession(
      {
        report_error: (args) => {
          seen.push(args);
          return ok({ reportId: "r1" });
        },
        checkout: () => ok({}),
      },
      {},
      (tool) => (tool === "checkout" ? "instamart" : "food"),
    );
    await executeGuardedTool(session, nextUserId++, "report_error", {
      tool: "checkout",
      errorMessage: "boom",
    });
    // Swiggy calls the Instamart server "im", not "instamart".
    expect(seen[0].domain).toBe("im");
  });

  it("never overrides a domain the model supplied", async () => {
    const seen: Record<string, unknown>[] = [];
    const session = fakeSession({
      report_error: (args) => {
        seen.push(args);
        return ok({});
      },
      checkout: () => ok({}),
    });
    await executeGuardedTool(session, nextUserId++, "report_error", {
      tool: "checkout",
      errorMessage: "boom",
      domain: "dineout",
    });
    expect(seen[0].domain).toBe("dineout");
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

/**
 * Response shapes lifted from the vendored place-order references
 * (docs/swiggy/reference/{food,instamart,dineout}). Instamart and Dineout
 * carry no `normalizedStatus`; only Food does.
 */
const PENDING_FOOD = {
  success: true,
  data: {
    orderId: "ord_42",
    paasId: "paas_42",
    transactionId: "txn_42",
    upiIntentUrl: "upi://pay?pa=swiggy@icici&am=420",
    bridgeUrl: "https://mcp.swiggy.com/pay/bridge?paasId=paas_42&orderId=ord_42",
    isQrFlow: false,
    pollingIntervalInMs: 3000,
    maxTimeToPollForInMs: 300000,
    paymentMethod: "UPI",
    status: "PENDING_PAYMENT",
    normalizedStatus: "pending",
    addressId: "addr_1",
    cartId: "cart_1",
    lat: 12.9716,
    lng: 77.5946,
  },
};

const PENDING_INSTAMART = {
  success: true,
  data: {
    orderId: "ord_im",
    transactionId: "txn_im",
    paasId: "paas_im",
    upiIntentUrl: "upi://pay?pa=swiggy@icici&am=310",
    bridgeUrl: "https://mcp.swiggy.com/pay/bridge?paasId=paas_im&orderId=ord_im",
    isQrFlow: true,
    pollingIntervalInMs: 3000,
    maxTimeToPollForInMs: 300000,
    paymentMethod: "UPI",
    status: "PENDING_PAYMENT",
    cartTotal: 310,
  },
};

const PENDING_DINEOUT = {
  success: true,
  data: {
    orderId: "ord_do",
    paasId: "paas_do",
    transactionId: "txn_do",
    upiIntentUrl: "upi://pay?pa=swiggy@icici&am=199",
    bridgeUrl: "https://mcp.swiggy.com/pay/bridge?paasId=paas_do&orderId=ord_do",
    isQrFlow: false,
    pollingIntervalInMs: 3000,
    maxTimeToPollForInMs: 300000,
    paymentMethod: "UPI",
    status: "PENDING_PAYMENT",
    isDineout: true,
  },
};

const CONFIRMED_FOOD = {
  success: true,
  data: {
    orderId: "ord_cash",
    status: "CONFIRMED",
    normalizedStatus: "success",
    totalAmount: 420,
    restaurantName: "Meghana Foods",
  },
};

describe("rate-limited reads share the 10s cooldown", () => {
  const FIRST_CALL: Record<string, Record<string, unknown>> = {
    check_payment_status: { paasId: "paas_42" },
    get_food_delivery_status: { orderId: "ord_42" },
    get_delivery_status: { orderId: "ord_im", addressId: "addr_1" },
  };

  for (const [tool, args] of Object.entries(FIRST_CALL)) {
    it(`lets ${tool} through once, then refuses the next call`, async () => {
      const userId = nextUserId++;
      const session = fakeSession({ [tool]: () => ok({ status: "pending" }) });

      const first = await executeGuardedTool(session, userId, tool, args);
      expect(first.isError).toBe(false);

      const second = await executeGuardedTool(session, userId, tool, args);
      expect(second.isError).toBe(true);
      expect(second.text).toContain(tool);
      expect(second.text).toContain("last known status");
      expect(second.text).toContain("Do not call this tool again yet");
    });
  }

  it("keeps the cooldown per tool, so a payment check does not block tracking", async () => {
    const userId = nextUserId++;
    const session = fakeSession({
      check_payment_status: () => ok({ status: "pending", terminal: false }),
      track_food_order: () => ok({ status: "OUT_FOR_DELIVERY" }),
    });
    await executeGuardedTool(session, userId, "check_payment_status", { paasId: "paas_42" });
    const track = await executeGuardedTool(session, userId, "track_food_order", {
      orderId: "ord_42",
    });
    expect(track.isError).toBe(false);
  });
});

describe("confirm_order", () => {
  const turn = () => ({ userText: "paid", confirmedOrders: new Set<string>() });

  it("needs no consent gate: the user consented at placement and paid themselves", async () => {
    const session = fakeSession({
      confirm_order: () => ok({ orderId: "ord_42", result: "success" }),
    });
    const result = await executeGuardedTool(session, nextUserId++, "confirm_order", {
      orderId: "ord_42",
      addressId: "addr_1",
      lat: 12.9716,
      lng: 77.5946,
    });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("ord_42");
  });

  it("blocks a second call for the same order in one turn, but not a different order", async () => {
    const confirm = vi.fn().mockResolvedValue(ok({ result: "success" }));
    const session = fakeSession({ confirm_order: confirm });
    const userId = nextUserId++;
    const ctx = turn();

    expect(
      (await executeGuardedTool(session, userId, "confirm_order", { orderId: "ord_42" }, ctx))
        .isError,
    ).toBe(false);

    const again = await executeGuardedTool(
      session,
      userId,
      "confirm_order",
      { orderId: "ord_42", paasId: "paas_42" },
      ctx,
    );
    expect(again.isError).toBe(true);
    expect(again.text).toContain("already run for order ord_42");

    const other = await executeGuardedTool(
      session,
      userId,
      "confirm_order",
      { orderId: "ord_99" },
      ctx,
    );
    expect(other.isError).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("refuses to guess an order id", async () => {
    const confirm = vi.fn();
    const session = fakeSession({ confirm_order: confirm });
    const result = await executeGuardedTool(session, nextUserId++, "confirm_order", {
      paasId: "paas_42",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Never invent an order id");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("is retried through a transient 5xx, because Swiggy documents it idempotent", async () => {
    const confirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 502 Bad Gateway"))
      .mockRejectedValueOnce(new Error("HTTP 503 Service Unavailable"))
      .mockResolvedValueOnce(ok({ orderId: "ord_42", result: "success" }));
    const session = fakeSession({ confirm_order: confirm });
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "confirm_order",
      { orderId: "ord_42" },
      turn(),
    );
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(result.isError).toBe(false);
  });

  it("latches only on an answer from Swiggy, so a failed attempt can be retried", async () => {
    // A 5xx that exhausted the retries told the model nothing; latching it
    // would turn "may retry once" into "already confirmed".
    const confirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 502 Bad Gateway"))
      .mockRejectedValueOnce(new Error("HTTP 502 Bad Gateway"))
      .mockRejectedValueOnce(new Error("HTTP 502 Bad Gateway"))
      .mockRejectedValueOnce(new Error("HTTP 502 Bad Gateway"))
      .mockRejectedValueOnce(new Error("HTTP 502 Bad Gateway"))
      .mockResolvedValueOnce(ok({ orderId: "ord_42", result: "success" }));
    const session = fakeSession({ confirm_order: confirm });
    const userId = nextUserId++;
    const ctx = turn();

    await expect(
      executeGuardedTool(session, userId, "confirm_order", { orderId: "ord_42" }, ctx),
    ).rejects.toThrow("502");
    expect(ctx.confirmedOrders.has("ord_42")).toBe(false);

    const retry = await executeGuardedTool(
      session,
      userId,
      "confirm_order",
      { orderId: "ord_42" },
      ctx,
    );
    expect(retry.isError).toBe(false);
    expect(ctx.confirmedOrders.has("ord_42")).toBe(true);
  });
});

describe("cancel_booking is destructive", () => {
  it("refuses without the user's own confirmation, then allows it", async () => {
    const cancel = vi.fn().mockResolvedValue(ok({ orderId: "ord_do", status: "CANCELLED" }));
    const session = fakeSession({ cancel_booking: cancel });
    const userId = nextUserId++;

    const refused = await executeGuardedTool(
      session,
      userId,
      "cancel_booking",
      { orderId: "ord_do" },
      { userText: "I can't make it tonight" },
    );
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("cancels a confirmed table booking");
    expect(refused.text).toContain("restaurant, date, time, guests");
    expect(cancel).not.toHaveBeenCalled();

    const allowed = await executeGuardedTool(
      session,
      userId,
      "cancel_booking",
      { orderId: "ord_do" },
      { userText: "yes" },
    );
    expect(allowed.isError).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("PENDING_PAYMENT placements are annotated, not announced", () => {
  const CASES: [string, unknown, Record<string, unknown>][] = [
    ["place_food_order", PENDING_FOOD, { addressId: "addr_1" }],
    ["checkout", PENDING_INSTAMART, { addressId: "addr_1" }],
    ["book_table", PENDING_DINEOUT, { slotId: 1 }],
  ];

  for (const [tool, payload, args] of CASES) {
    it(`appends _payment_note to a pending ${tool} result and keeps bridgeUrl`, async () => {
      const session = fakeSession({
        get_food_cart: () => ok({ cart: { bill_total: 420 } }),
        get_cart: () => ok({ bill: { total_to_pay: 310 } }),
        [tool]: () => ok(payload),
      });
      const result = await executeGuardedTool(session, nextUserId++, tool, args, CONFIRMED);
      expect(result.isError).toBe(false);

      const parsed = JSON.parse(result.text) as Record<string, unknown> & {
        data: Record<string, unknown>;
      };
      expect(parsed._payment_note).toContain("NOT placed yet");
      expect(parsed._payment_note).toContain("bridgeUrl");
      expect(parsed._payment_note).toContain("Do not call check_payment_status in this turn");
      // Every original field survives untouched, the payment link above all.
      expect(parsed.data).toEqual((payload as { data: unknown }).data);
    });
  }

  it("says nothing on a Cash placement that is already CONFIRMED", async () => {
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 420 } }),
      place_food_order: () => ok(CONFIRMED_FOOD),
    });
    const result = await executeGuardedTool(
      session,
      nextUserId++,
      "place_food_order",
      { addressId: "addr_1" },
      CONFIRMED,
    );
    expect(result.text).not.toContain("_payment_note");
    expect(JSON.parse(result.text)).toEqual(CONFIRMED_FOOD);
  });

  it("latches the placement: a PENDING_PAYMENT order already exists server-side", async () => {
    const place = vi.fn().mockResolvedValue(ok(PENDING_FOOD));
    const session = fakeSession({
      get_food_cart: () => ok({ cart: { bill_total: 420 } }),
      place_food_order: place,
    });
    const userId = nextUserId++;
    const ctx = { userText: "yes", completed: new Set<string>() };

    expect(
      (await executeGuardedTool(session, userId, "place_food_order", { addressId: "addr_1" }, ctx))
        .isError,
    ).toBe(false);
    const second = await executeGuardedTool(
      session,
      userId,
      "place_food_order",
      { addressId: "addr_1" },
      ctx,
    );
    expect(second.isError).toBe(true);
    expect(second.text).toContain("already completed");
    expect(place).toHaveBeenCalledTimes(1);
  });
});

describe("create_address", () => {
  const ADDRESS = {
    fullAddress: "12B, Sobha Lotus, Sarjapur Road, Bengaluru 560103",
    addressLine: "12B, Sobha Lotus",
    addressLine2: "Sarjapur Road",
    city: "Bengaluru",
    postalCode: "560103",
    addressCategory: "HOME",
    userName: "Ada",
    userPhone: "+919000000000",
  };

  const addressSession = (seen: Record<string, unknown>[]) =>
    fakeSession({
      create_address: (args) => {
        seen.push(args);
        return ok({ addressId: "addr_new_123" });
      },
    });

  it("strips coordinates the model invented from the doc example", async () => {
    // The reference page's example pin is 12.9716, 77.5946 - pasted verbatim
    // it delivers a real order to the middle of Bengaluru.
    const seen: Record<string, unknown>[] = [];
    const result = await executeGuardedTool(
      addressSession(seen),
      nextUserId++,
      "create_address",
      { ...ADDRESS, latitude: 12.9716, longitude: 77.5946 },
      { userText: "add my home address: 12B, Sobha Lotus, Sarjapur Road, Bengaluru 560103" },
    );
    expect(result.isError).toBe(false);
    expect(seen[0]).toEqual(ADDRESS);
  });

  it("keeps coordinates the user typed themselves", async () => {
    const seen: Record<string, unknown>[] = [];
    await executeGuardedTool(
      addressSession(seen),
      nextUserId++,
      "create_address",
      { ...ADDRESS, latitude: 12.9716, longitude: 77.5946 },
      { userText: "my pin is 12.9716, 77.5946 - save it as home" },
    );
    expect(seen[0].latitude).toBe(12.9716);
    expect(seen[0].longitude).toBe(77.5946);
  });

  it("does not mistake a postal code or phone number for a pin", async () => {
    const seen: Record<string, unknown>[] = [];
    await executeGuardedTool(
      addressSession(seen),
      nextUserId++,
      "create_address",
      { ...ADDRESS, latitude: 12.9716, longitude: 77.5946 },
      { userText: "Bengaluru 560103, call me on 98765 43210" },
    );
    expect(seen[0]).not.toHaveProperty("latitude");
  });

  it("blocks a category outside the five Swiggy accepts", async () => {
    const seen: Record<string, unknown>[] = [];
    const result = await executeGuardedTool(
      addressSession(seen),
      nextUserId++,
      "create_address",
      { ...ADDRESS, addressCategory: "HOUSE" },
      { userText: "save my house address" },
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("FRIENDS_AND_FAMILY");
    expect(seen).toHaveLength(0);
  });
});

describe("the phantom-coupon scrub covers Instamart too", () => {
  for (const tool of ["get_cart", "apply_coupon"]) {
    it(`scrubs a zero-discount coupon out of ${tool}`, async () => {
      const session = fakeSession({
        [tool]: () => ok({ bill: { coupon_applied: "SAVE100", coupon_discount: 0, total: 310 } }),
      });
      const result = await executeGuardedTool(session, nextUserId++, tool, {
        addressId: "addr_1",
        couponCode: "SAVE100",
      });
      expect(result.text).not.toContain("SAVE100");
      expect(result.text).toContain("No coupon is actually applied");
    });
  }
});
