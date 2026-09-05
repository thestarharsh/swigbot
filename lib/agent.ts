import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { getChatModel } from "./llm";
import { sanitizeHistory } from "./llm/history";
import type { ChatMessage, ChatModel, ToolResult } from "./llm/types";
import { buildSystemPrompt } from "./prompt";
import { beginAuth, getValidToken, invalidateToken } from "./swiggy-auth";
import { SwiggyAuthError, messageOf } from "./mcp/errors";
import { getMcpSession, evictMcpSession, type SwiggyMcpSession } from "./mcp/session";
import { executeGuardedTool, tryParseJson } from "./mcp/guardrails";

type User = typeof schema.users.$inferSelect;

const MAX_ITERATIONS = 12;
/** Identical repeats of one tool call within a turn before it is refused. */
const MAX_IDENTICAL_CALLS = 2;
const HISTORY_LIMIT = 40;
/** Menus can be enormous; cap what one tool result adds to context. */
const TOOL_RESULT_MAX_CHARS = 12_000;
/** Longer than the webhook's maxDuration, so a killed instance still frees it. */
const TURN_LOCK_TTL_SECONDS = 90;

export async function ensureUser(
  platform: string,
  platformUserId: string,
  name?: string | null,
): Promise<User> {
  const [user] = await db
    .insert(schema.users)
    .values({ platform, platformUserId, name })
    .onConflictDoUpdate({
      target: [schema.users.platform, schema.users.platformUserId],
      set: { name: name ?? sql`${schema.users.name}` },
    })
    .returning();
  return user;
}

async function loadHistory(userId: number): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.userId, userId))
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(HISTORY_LIMIT);
  return sanitizeHistory(rows.reverse().map((r) => r.content as ChatMessage));
}

async function persist(userId: number, message: ChatMessage): Promise<void> {
  await db.insert(schema.messages).values({ userId, role: message.role, content: message });
}

/**
 * One statement, so two instances cannot both believe they hold the lock:
 * the insert wins outright, and the conflicting update only fires on a row
 * whose TTL has already passed. Not a transaction - transactions bypass the
 * connection retry wrapper in lib/db.
 */
async function acquireTurnLock(userId: number): Promise<boolean> {
  try {
    const { rows } = await db.execute(sql`
      insert into public.turn_locks (user_id, expires_at)
      values (${userId}, now() + make_interval(secs => ${TURN_LOCK_TTL_SECONDS}))
      on conflict (user_id) do update
        set expires_at = now() + make_interval(secs => ${TURN_LOCK_TTL_SECONDS})
        where turn_locks.expires_at < now()
      returning user_id
    `);
    return rows.length > 0;
  } catch (err) {
    // Fails open, like the webhook's update dedupe: an unreachable database
    // must not cost the user their turn.
    console.warn(`[agent] turn lock unavailable, proceeding unlocked: ${messageOf(err)}`);
    return true;
  }
}

async function releaseTurnLock(userId: number): Promise<void> {
  await db
    .delete(schema.turnLocks)
    .where(eq(schema.turnLocks.userId, userId))
    .catch(() => {});
}

async function authLinkMessage(user: User): Promise<string> {
  const url = await beginAuth(user.id);
  const name = user.name ? ` ${user.name}` : "";
  return (
    `Hey${name}! I need to link your Swiggy account before we can order. ` +
    `Tap this link to log in with your Swiggy phone number (takes 30 seconds):\n\n${url}\n\n` +
    `Once done, just message me and we're ready to go!`
  );
}

/**
 * Everything the turn loop touches outside itself. Production passes nothing;
 * tests replace only the pieces they exercise.
 */
export interface AgentDeps {
  getModel(): ChatModel;
  getSession(token: string): Promise<SwiggyMcpSession>;
  evictSession(token: string): void;
  getValidToken(userId: number): Promise<string | null>;
  invalidateToken(userId: number): Promise<void>;
  loadHistory(userId: number): Promise<ChatMessage[]>;
  persist(userId: number, message: ChatMessage): Promise<void>;
  authLink(user: User): Promise<string>;
  acquireTurnLock(userId: number): Promise<boolean>;
  releaseTurnLock(userId: number): Promise<void>;
  executeTool: typeof executeGuardedTool;
}

const DEFAULT_DEPS: AgentDeps = {
  getModel: getChatModel,
  getSession: getMcpSession,
  evictSession: evictMcpSession,
  getValidToken,
  invalidateToken,
  loadHistory,
  persist,
  authLink: authLinkMessage,
  acquireTurnLock,
  releaseTurnLock,
  executeTool: executeGuardedTool,
};

/**
 * Menus and order lists blow past the cap, and a blind slice cuts JSON
 * mid-string - the model then treats the whole result as unusable. Dropping
 * trailing elements of the biggest array keeps the shape parseable.
 */
export function truncateToolResult(text: string, max = TOOL_RESULT_MAX_CHARS): string {
  if (text.length <= max) return text;

  const parsed = tryParseJson(text);
  const biggest = parsed == null ? null : largestArray(parsed);
  if (parsed != null && biggest && biggest.length > 1) {
    const original = biggest.length;
    const render = () => JSON.stringify(withTruncationNote(parsed, original - biggest.length));
    // One proportional cut first: popping element by element through a
    // thousand-item menu would re-serialise it a thousand times.
    const first = render();
    if (first.length > max) {
      biggest.length = Math.max(1, Math.floor(biggest.length * (max / first.length)));
    }
    while (biggest.length > 0) {
      const out = render();
      if (out.length <= max) return out;
      biggest.pop();
    }
  }

  return text.slice(0, max) + "\n…(truncated - ask for a narrower query if you need more)";
}

function largestArray(value: unknown): unknown[] | null {
  let best: unknown[] | null = null;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (!best || node.length > best.length) best = node;
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(value);
  return best;
}

function withTruncationNote(root: unknown, omitted: number): unknown {
  const note = `${omitted} item(s) omitted to fit the context window - narrow the query for the rest.`;
  if (Array.isArray(root)) return [...root, { _truncated_note: note }];
  return { ...(root as Record<string, unknown>), _truncated_note: note };
}

/** One conversational turn: auth pre-flight, then the LLM/tool loop until a reply. */
export async function runAgentTurn(
  user: User,
  surface: string,
  text: string,
  deps: Partial<AgentDeps> = {},
): Promise<string> {
  const d: AgentDeps = { ...DEFAULT_DEPS, ...deps };

  const token = await d.getValidToken(user.id);
  if (!token) return d.authLink(user);

  // Held for the whole turn: two messages from one chat land on two instances
  // that share only the database, and their tool calls would interleave over
  // a single server-side cart.
  if (!(await d.acquireTurnLock(user.id))) {
    return "Still working on your last message, give me a moment.";
  }

  try {
    return await runLockedTurn(d, user, surface, text, token);
  } finally {
    await d.releaseTurnLock(user.id);
  }
}

async function runLockedTurn(
  d: AgentDeps,
  user: User,
  surface: string,
  text: string,
  token: string,
): Promise<string> {
  let session: SwiggyMcpSession;
  try {
    session = await d.getSession(token);
  } catch (err) {
    if (err instanceof SwiggyAuthError) {
      await d.invalidateToken(user.id);
      d.evictSession(token);
      return `Your Swiggy session expired. ${await d.authLink(user)}`;
    }
    throw err;
  }

  const model = d.getModel();
  const system = buildSystemPrompt(user, surface);
  const messages = await d.loadHistory(user.id);

  const repeats = new Map<string, number>();
  // Survives the whole turn: the repeat-breaker only catches identical
  // arguments, so it cannot stop a second order placed with a tweaked payload.
  const completed = new Set<string>();
  const userMessage: ChatMessage = { role: "user", content: text };
  messages.push(userMessage);
  await d.persist(user.id, userMessage);

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await model.chat({ system, messages, tools: session.tools });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.text,
        ...(response.toolCalls.length ? { toolCalls: response.toolCalls } : {}),
      };
      messages.push(assistantMessage);
      await d.persist(user.id, assistantMessage);

      if (!response.toolCalls.length) {
        const reply = response.text || "…";
        // A truncated reply looks finished to the user otherwise.
        return response.stopReason === "max_tokens"
          ? `${reply}\n\n(I ran out of room. Say "continue" for the rest.)`
          : reply;
      }

      const results: ToolResult[] = [];
      for (const call of response.toolCalls) {
        // Repeating a failing call burns one request per iteration and ends
        // the turn at the cap with nothing to show.
        const signature = `${call.name}:${JSON.stringify(call.input)}`;
        const seen = (repeats.get(signature) ?? 0) + 1;
        repeats.set(signature, seen);
        if (seen > MAX_IDENTICAL_CALLS) {
          results.push({
            toolCallId: call.id,
            content:
              `You have already called ${call.name} with these exact arguments ${seen - 1} times ` +
              `in this turn and the result will not change. Stop calling it. Either ask the user ` +
              `for the missing detail, or tell them plainly what is not working.`,
            isError: true,
          });
          continue;
        }

        const outcome = await d.executeTool(session, user.id, call.name, call.input, {
          userText: text,
          completed,
        });
        results.push({
          toolCallId: call.id,
          content: truncateToolResult(outcome.text || "(empty result)"),
          isError: outcome.isError,
        });
      }

      const resultsMessage: ChatMessage = { role: "tool_results", results };
      messages.push(resultsMessage);
      await d.persist(user.id, resultsMessage);
    }

    return "That took more steps than expected and I stopped to be safe. Could you rephrase or break the request into smaller parts?";
  } catch (err) {
    if (err instanceof SwiggyAuthError) {
      await d.invalidateToken(user.id);
      d.evictSession(token);
      return `Your Swiggy session expired. ${await d.authLink(user)}`;
    }
    console.error("[agent] turn failed:", err);
    return "Sorry - something went wrong on my side. Please try that again in a moment.";
  }
}
