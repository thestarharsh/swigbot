import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-secret";

const state = vi.hoisted(() => ({
  /** update_ids already claimed, mirroring the processed_updates insert. */
  claimed: new Set<number>(),
  sent: [] as { chatId: number | string; text: string }[],
  turns: [] as string[],
  logouts: [] as number[],
  reply: "Order placed.",
  turnThrows: false,
  claimThrows: false,
  /** Queue of scheduled `after` callbacks, run explicitly by the test. */
  pending: [] as (() => Promise<unknown>)[],
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (fn: () => Promise<unknown>) => {
      state.pending.push(fn);
    },
  };
});

/** Just enough Drizzle to model the processed_updates claim across instances. */
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("../lib/db/schema")>("../lib/db/schema");

  const insert = () => {
    if (state.claimThrows) throw new Error("Connection terminated unexpectedly");
    let updateId: number | undefined;
    const self: Record<string, unknown> = {
      values: (v: { updateId: number }) => {
        updateId = v.updateId;
        return self;
      },
      onConflictDoNothing: () => self,
      returning: async () => {
        if (updateId === undefined || state.claimed.has(updateId)) return [];
        state.claimed.add(updateId);
        return [{ updateId }];
      },
    };
    return self;
  };

  // processed_updates is the only table the route deletes from, whether it is
  // freeing a failed claim or sweeping expired rows.
  const remove = () => {
    const self: Record<string, unknown> = {
      where: () => self,
      then: (res: (v: unknown) => unknown) => {
        state.claimed.clear();
        return Promise.resolve([]).then(res);
      },
      catch: () => {
        state.claimed.clear();
        return Promise.resolve([]);
      },
    };
    return self;
  };

  return { schema, db: { insert, delete: remove } };
});

vi.mock("@/lib/agent", () => ({
  ensureUser: async () => ({ id: 1, platform: "telegram", platformUserId: "42", name: "Ada" }),
  runAgentTurn: async (_u: unknown, _s: string, text: string) => {
    state.turns.push(text);
    if (state.turnThrows) throw new Error("model exploded");
    return state.reply;
  },
}));

vi.mock("@/lib/telegram", () => ({
  sendMessage: async (chatId: number | string, text: string) => {
    state.sent.push({ chatId, text });
  },
  sendTyping: async () => {},
}));

vi.mock("@/lib/swiggy-auth", () => ({
  logout: async (id: number) => {
    state.logouts.push(id);
  },
}));

let POST: (req: Request) => Promise<Response>;

function update(over: Record<string, unknown> = {}, id = 100) {
  return {
    update_id: id,
    message: {
      message_id: 1,
      from: { id: 42, first_name: "Ada" },
      chat: { id: 42, type: "private" },
      text: "biryani please",
      ...over,
    },
  };
}

function post(body: unknown, secret: string | null = SECRET) {
  return new Request("http://localhost:3000/api/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Telegram is acked first and the turn runs in `after`; drain it by hand. */
async function drain() {
  const queued = state.pending.splice(0);
  for (const fn of queued) await fn();
}

beforeEach(async () => {
  state.claimed.clear();
  state.sent.length = 0;
  state.turns.length = 0;
  state.logouts.length = 0;
  state.pending.length = 0;
  state.reply = "Order placed.";
  state.turnThrows = false;
  state.claimThrows = false;

  process.env.WEBHOOK_SECRET = SECRET;
  vi.resetModules();
  ({ POST } = (await import("@/app/api/webhook/route")) as unknown as {
    POST: (req: Request) => Promise<Response>;
  });
});

afterEach(() => {
  delete process.env.WEBHOOK_SECRET;
});

describe("telegram webhook", () => {
  it("rejects an update carrying the wrong secret", async () => {
    const res = await POST(post(update(), "not-the-secret"));
    expect(res.status).toBe(401);
    expect(state.pending).toHaveLength(0);
  });

  it("acks and ignores group chats and other bots", async () => {
    for (const body of [
      update({ chat: { id: -100, type: "group" } }),
      update({ from: { id: 9, is_bot: true } }),
    ]) {
      const res = await POST(post(body));
      expect(res.status).toBe(200);
    }
    await drain();
    expect(state.turns).toEqual([]);
  });

  it("unlinks the account on /logout without running a turn", async () => {
    await POST(post(update({ text: "/logout" })));
    await drain();
    expect(state.logouts).toEqual([1]);
    expect(state.turns).toEqual([]);
    expect(state.sent[0].text).toContain("unlinked");
  });

  it("answers a photo or voice note instead of dropping it silently", async () => {
    await POST(post(update({ text: undefined })));
    await drain();
    expect(state.turns).toEqual([]);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].text).toBe(
      "I can only read text messages for now. Type what you'd like to order.",
    );
  });

  it("processes a redelivered update_id only once", async () => {
    await POST(post(update({}, 500)));
    await POST(post(update({}, 500)));
    await drain();
    expect(state.turns).toEqual(["biryani please"]);
  });

  it("releases the claim and apologises when the turn throws", async () => {
    state.turnThrows = true;
    await POST(post(update({}, 700)));
    await drain();
    expect(state.sent.at(-1)?.text).toContain("something went wrong");

    // The claim is gone, so Telegram's resend is processed rather than dropped.
    state.turnThrows = false;
    await POST(post(update({}, 700)));
    await drain();
    expect(state.turns).toHaveLength(2);
  });

  it("processes anyway when the dedupe write itself fails", async () => {
    state.claimThrows = true;
    await POST(post(update({}, 900)));
    await drain();
    expect(state.turns).toEqual(["biryani please"]);
  });

  it("rewrites /start into a greeting the model can answer", async () => {
    await POST(post(update({ text: "/start" }, 1100)));
    await drain();
    expect(state.turns).toEqual(["Hi!"]);
  });
});
