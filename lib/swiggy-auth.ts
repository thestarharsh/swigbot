import crypto from "crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "./db";
import { swiggyBaseUrl } from "./swiggy-config";

/**
 * Kept separate from the public app URL: Swiggy allowlists redirect URIs by
 * exact match and permits only HTTPS or `http://localhost`, so tunnel and
 * hosting hostnames are rejected at /authorize.
 */
export const redirectUri = () =>
  `${process.env.SWIGGY_REDIRECT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/callback/swiggy`;

/** Max age of a pending PKCE session (user typing phone + OTP in browser). */
const AUTH_SESSION_TTL_MS = 15 * 60 * 1000;

/**
 * Dynamic Client Registration (RFC 7591). Swiggy has no static client id or
 * secret; we register once, persist the client_id, and re-register whenever a
 * redirect URI appears that the registration does not yet carry. The list
 * accumulates rather than being replaced: production (Vercel) and local dev
 * (localhost) share this one database row, and each replacing the other's URI
 * would make every alternate login re-register.
 */
export async function getClientId(): Promise<string> {
  const uri = redirectUri();
  const [existing] = await db.select().from(schema.oauthClient).limit(1);
  if (existing && existing.redirectUris.includes(uri)) return existing.clientId;
  const uris = [...new Set([...(existing?.redirectUris ?? []), uri])];

  const res = await fetch(`${swiggyBaseUrl()}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "swigbot",
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!res.ok) {
    throw new Error(`Swiggy DCR failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { client_id?: string };
  if (!body.client_id) throw new Error("Swiggy DCR response missing client_id");

  if (existing) {
    await db
      .update(schema.oauthClient)
      .set({ clientId: body.client_id, redirectUris: uris, raw: body })
      .where(eq(schema.oauthClient.id, existing.id));
  } else {
    await db.insert(schema.oauthClient).values({
      clientId: body.client_id,
      redirectUris: uris,
      raw: body,
    });
  }
  return body.client_id;
}

/** Starts a per-user PKCE authorization; returns the browser login URL. */
export async function beginAuth(userId: number): Promise<string> {
  await db
    .delete(schema.oauthSessions)
    .where(lt(schema.oauthSessions.createdAt, new Date(Date.now() - AUTH_SESSION_TTL_MS)));

  const clientId = await getClientId();
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const state = crypto.randomBytes(24).toString("base64url");

  await db.insert(schema.oauthSessions).values({
    state,
    codeVerifier,
    userId,
    redirectUri: redirectUri(),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    scope: "mcp:tools",
  });
  return `${swiggyBaseUrl()}/auth/authorize?${params}`;
}

/**
 * Exchanges the authorization code (120s, single-use) for a 5-day access
 * token, stores it against the user, and returns the linked user id.
 */
export async function handleCallback(code: string, state: string): Promise<number> {
  // Claimed before the exchange, not after: a double-opened link otherwise
  // ran two exchanges against the same single-use code.
  const [session] = await db
    .update(schema.oauthSessions)
    .set({ used: true })
    .where(and(eq(schema.oauthSessions.state, state), eq(schema.oauthSessions.used, false)))
    .returning();
  if (!session) throw new Error("Unknown or already-used OAuth state");
  if (Date.now() - session.createdAt.getTime() > AUTH_SESSION_TTL_MS) {
    throw new Error("Login link expired - request a new one from the bot");
  }

  const clientId = await getClientId();
  const res = await fetch(`${swiggyBaseUrl()}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: session.codeVerifier,
      client_id: clientId,
      redirect_uri: session.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: HTTP ${res.status} ${await res.text()}`);
  }
  const token = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
  };

  await db
    .insert(schema.swiggyTokens)
    .values({
      userId: session.userId,
      accessToken: token.access_token,
      scope: token.scope,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    })
    .onConflictDoUpdate({
      target: schema.swiggyTokens.userId,
      set: {
        accessToken: token.access_token,
        scope: token.scope,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        createdAt: new Date(),
      },
    });

  return session.userId;
}

/**
 * Returns a token with at least 60s of validity left, else null. v1 has no
 * refresh tokens, so null means the caller sends a fresh login link.
 */
export async function getValidToken(userId: number): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.swiggyTokens)
    .where(eq(schema.swiggyTokens.userId, userId));
  if (!row) return null;
  if (row.expiresAt.getTime() - Date.now() < 60_000) return null;
  return row.accessToken;
}

/**
 * The most recently linked account with a live token, for the scripts that
 * need any real session (smoke:tools, schemas). Null when nobody has logged in.
 */
export async function latestLinkedToken(): Promise<typeof schema.swiggyTokens.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(schema.swiggyTokens)
    .where(gt(schema.swiggyTokens.expiresAt, new Date()))
    .orderBy(desc(schema.swiggyTokens.createdAt))
    .limit(1);
  return row ?? null;
}

/** Drops a token the server rejected. */
export async function invalidateToken(userId: number): Promise<void> {
  await db.delete(schema.swiggyTokens).where(eq(schema.swiggyTokens.userId, userId));
}

/** Revokes the Swiggy session server-side and forgets the token. */
export async function logout(userId: number): Promise<void> {
  const token = await getValidToken(userId);
  if (token) {
    await fetch(`${swiggyBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  await invalidateToken(userId);
}
