import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  bigint,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * One row per end user per platform; feeds the prompt's runtime context.
 * Cached Swiggy profile hints (saved address, dietary preferences, last
 * restaurant) used to live here but nothing ever wrote them - the address and
 * the cart are read fresh from Swiggy every turn.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    platform: text("platform").notNull(), // "telegram" | "cli" | ...
    platformUserId: text("platform_user_id").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_platform_uid").on(t.platform, t.platformUserId)],
);

/** Swiggy access token per user. No refresh tokens in v1; expiry means re-auth. */
export const swiggyTokens = pgTable("swiggy_tokens", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  scope: text("scope"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** In-flight PKCE logins, keyed by the state token the browser carries. */
export const oauthSessions = pgTable("oauth_sessions", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Dynamic Client Registration result. One row, registered lazily, shared by all users. */
export const oauthClient = pgTable("oauth_client", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  raw: jsonb("raw"),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
});

/**
 * Conversation history. `content` holds the provider-agnostic ChatMessage
 * JSON; `role` mirrors it verbatim - "user" | "assistant" | "tool_results".
 */
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("messages_user_created").on(t.userId, t.createdAt)],
);

/** Handled update IDs. Serverless instances share no memory, so dedupe lives here. */
export const processedUpdates = pgTable("processed_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** One row per tool call, per the ship-to-production observability guidance. */
export const toolCallLog = pgTable(
  "tool_call_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    server: text("server"),
    tool: text("tool").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("tool_call_log_user_created").on(t.userId, t.createdAt)],
);

/**
 * One in-flight turn per user. Serverless instances share no memory, so two
 * concurrent messages from the same chat would otherwise interleave their
 * tool calls against one server-side cart. Rows expire rather than unlock,
 * so a crashed instance cannot wedge a user out.
 */
export const turnLocks = pgTable("turn_locks", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
