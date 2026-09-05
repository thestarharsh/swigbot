import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** Rows each table's next read returns, keyed by table name. */
  rows: {} as Record<string, unknown[]>,
  /** Every terminal query, in order. */
  log: [] as { op: string; table: string; args: unknown[][] }[],
}));

/**
 * A chainable Drizzle stand-in: every builder method records its arguments
 * and returns itself, and awaiting resolves to whatever `state.rows` holds
 * for the table the chain named.
 */
vi.mock("../lib/db", async () => {
  const { getTableName } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  const schema = await vi.importActual<typeof import("../lib/db/schema")>("../lib/db/schema");

  const chain = (op: string, table?: unknown) => {
    const entry = { op, table: table ? getTableName(table as never) : "", args: [] as unknown[][] };
    const settle = () => {
      state.log.push(entry);
      return Promise.resolve(state.rows[entry.table] ?? []);
    };
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              settle().then(res, rej);
          }
          if (prop === "catch") return (rej: (e: unknown) => unknown) => settle().catch(rej);
          if (prop === "finally") return (fn: () => void) => settle().finally(fn);
          return (...args: unknown[]) => {
            if (prop === "from") entry.table = getTableName(args[0] as never);
            entry.args.push(args);
            return self;
          };
        },
      },
    );
    return self;
  };

  return {
    schema,
    db: {
      select: () => chain("select"),
      insert: (t: unknown) => chain("insert", t),
      update: (t: unknown) => chain("update", t),
      delete: (t: unknown) => chain("delete", t),
    },
  };
});

import { beginAuth, getValidToken, handleCallback } from "../lib/swiggy-auth";

const CLIENT = {
  id: 1,
  clientId: "cli_1",
  redirectUris: ["http://localhost:3000/api/auth/callback/swiggy"],
};

const find = (op: string, table: string) => state.log.find((e) => e.op === op && e.table === table);

beforeEach(() => {
  state.rows = {};
  state.log.length = 0;
  vi.unstubAllGlobals();
  process.env.SWIGGY_REDIRECT_BASE_URL = "http://localhost:3000";
  process.env.SWIGGY_MCP_BASE_URL = "https://mcp.swiggy.test";
});

describe("beginAuth", () => {
  it("mints an S256 PKCE URL and stores the verifier that matches it", async () => {
    state.rows.oauth_client = [CLIENT];
    const url = new URL(await beginAuth(7));

    expect(url.origin + url.pathname).toBe("https://mcp.swiggy.test/auth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe("cli_1");
    expect(url.searchParams.get("response_type")).toBe("code");

    const inserted = find("insert", "oauth_sessions")!.args[0][0] as {
      state: string;
      codeVerifier: string;
      userId: number;
    };
    expect(inserted.userId).toBe(7);
    expect(inserted.state).toBe(url.searchParams.get("state"));
    // The challenge must be the SHA-256 of the stored verifier, or Swiggy
    // rejects the exchange with no useful message.
    const expected = crypto.createHash("sha256").update(inserted.codeVerifier).digest("base64url");
    expect(url.searchParams.get("code_challenge")).toBe(expected);
  });

  it("re-registers with the union of redirect URIs, so prod and local dev stop overwriting each other", async () => {
    // One database row serves both environments; replacing the list would
    // make every alternate login re-register.
    state.rows.oauth_client = [CLIENT];
    process.env.SWIGGY_REDIRECT_BASE_URL = "https://swigbot.vercel.app";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ client_id: "cli_2" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const url = new URL(await beginAuth(7));

    expect(url.searchParams.get("client_id")).toBe("cli_2");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://swigbot.vercel.app/api/auth/callback/swiggy",
    );
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const body = JSON.parse(init.body) as { redirect_uris: string[] };
    expect(body.redirect_uris).toEqual([
      "http://localhost:3000/api/auth/callback/swiggy",
      "https://swigbot.vercel.app/api/auth/callback/swiggy",
    ]);
    const updated = find("update", "oauth_client")!.args[0][0] as { redirectUris: string[] };
    expect(updated.redirectUris).toEqual(body.redirect_uris);
  });
});

describe("handleCallback", () => {
  const tokenResponse = {
    ok: true,
    json: async () => ({
      access_token: "tok_live",
      token_type: "Bearer",
      expires_in: 432_000,
      scope: "mcp:tools",
    }),
  };

  it("rejects a state nobody issued", async () => {
    state.rows.oauth_sessions = [];
    await expect(handleCallback("code_1", "unknown")).rejects.toThrow("Unknown or already-used");
  });

  it("rejects a state older than the login TTL", async () => {
    state.rows.oauth_sessions = [
      {
        state: "s1",
        codeVerifier: "v1",
        userId: 7,
        redirectUri: "http://localhost:3000/api/auth/callback/swiggy",
        createdAt: new Date(Date.now() - 16 * 60 * 1000),
      },
    ];
    await expect(handleCallback("code_1", "s1")).rejects.toThrow("expired");
  });

  it("exchanges the code with a JSON body carrying the verifier, then stores the token", async () => {
    state.rows.oauth_sessions = [
      {
        state: "s1",
        codeVerifier: "verifier_abc",
        userId: 7,
        redirectUri: "http://localhost:3000/api/auth/callback/swiggy",
        createdAt: new Date(),
      },
    ];
    state.rows.oauth_client = [CLIENT];
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse);
    vi.stubGlobal("fetch", fetchMock);

    await expect(handleCallback("code_1", "s1")).resolves.toBe(7);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://mcp.swiggy.test/auth/token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    // v1 takes JSON, not form encoding, and PKCE has no client secret.
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      grant_type: "authorization_code",
      code: "code_1",
      code_verifier: "verifier_abc",
      client_id: "cli_1",
    });

    const upsert = find("insert", "swiggy_tokens")!;
    expect((upsert.args[0][0] as { accessToken: string }).accessToken).toBe("tok_live");
  });

  it("claims the state before the exchange, so a second open cannot re-use it", async () => {
    state.rows.oauth_sessions = [
      {
        state: "s1",
        codeVerifier: "v",
        userId: 7,
        redirectUri: "http://localhost:3000/api/auth/callback/swiggy",
        createdAt: new Date(),
      },
    ];
    state.rows.oauth_client = [CLIENT];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokenResponse));

    await handleCallback("code_1", "s1");

    const claim = state.log.find((e) => e.op === "update" && e.table === "oauth_sessions")!;
    expect(claim.args[0][0]).toEqual({ used: true });
    // The claim runs first; there is no second "mark used" write afterwards.
    expect(state.log.indexOf(claim)).toBe(0);
    expect(state.log.filter((e) => e.op === "update" && e.table === "oauth_sessions")).toHaveLength(
      1,
    );
  });
});

describe("getValidToken", () => {
  it("returns the token while it has real life left", async () => {
    state.rows.swiggy_tokens = [
      { userId: 7, accessToken: "tok", expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    ];
    await expect(getValidToken(7)).resolves.toBe("tok");
  });

  it("returns null inside the last 60 seconds, so the turn re-links instead of 401ing", async () => {
    state.rows.swiggy_tokens = [
      { userId: 7, accessToken: "tok", expiresAt: new Date(Date.now() + 30_000) },
    ];
    await expect(getValidToken(7)).resolves.toBeNull();
  });

  it("returns null when nothing is linked", async () => {
    state.rows.swiggy_tokens = [];
    await expect(getValidToken(7)).resolves.toBeNull();
  });
});
