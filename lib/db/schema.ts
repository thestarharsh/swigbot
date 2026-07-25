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

/** One row per end user per platform; feeds the prompt's runtime context. */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    platform: text("platform").notNull(), // "telegram" | "cli" | ...
    platformUserId: text("platform_user_id").notNull(),
    name: text("name"),
    // Cached Swiggy profile hints used for {{SAVED_ADDRESS_*}} / {{DIETARY_PREFERENCES}}
    savedAddressId: text("saved_address_id"),
    savedAddressLabel: text("saved_address_label"),
    dietaryPreferences: text("dietary_preferences"),
    lastOrderedFrom: text("last_ordered_from"),
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

/** Conversation history. `content` holds the provider-agnostic ChatMessage JSON. */
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

/**
 * Telegram update IDs already handled. Telegram redelivers on a slow ack, and
 * serverless instances share no memory, so dedupe has to live in the database.
 */
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
    sessionId: text("session_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("tool_call_log_user_created").on(t.userId, t.createdAt)],
);
