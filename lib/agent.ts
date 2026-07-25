import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { getChatModel } from "./llm";
import { sanitizeHistory } from "./llm/history";
import type { ChatMessage, ToolResult } from "./llm/types";
import { buildSystemPrompt } from "./prompt";
import { beginAuth, getValidToken, invalidateToken } from "./swiggy-auth";
import { SwiggyAuthError } from "./mcp/errors";
import { getMcpSession, evictMcpSession } from "./mcp/session";
import { executeGuardedTool } from "./mcp/guardrails";

type User = typeof schema.users.$inferSelect;

const MAX_ITERATIONS = 12;
/** Identical repeats of one tool call within a turn before it is refused. */
const MAX_IDENTICAL_CALLS = 2;
const HISTORY_LIMIT = 40;
/** Menus can be enormous; cap what one tool result adds to context. */
const TOOL_RESULT_MAX_CHARS = 12_000;

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
  await db.insert(schema.messages).values({
    userId,
    role: message.role === "user" ? "user" : "assistant",
    content: message,
  });
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

/** One conversational turn: auth pre-flight, then the LLM/tool loop until a reply. */
export async function runAgentTurn(user: User, surface: string, text: string): Promise<string> {
  const token = await getValidToken(user.id);
  if (!token) return authLinkMessage(user);

  let session;
  try {
    session = await getMcpSession(token);
  } catch (err) {
    if (err instanceof SwiggyAuthError) {
      await invalidateToken(user.id);
      evictMcpSession(token);
      return `Your Swiggy session expired. ${await authLinkMessage(user)}`;
    }
    throw err;
  }

  const model = getChatModel();
  const system = buildSystemPrompt(user, surface);
  const messages = await loadHistory(user.id);

  const repeats = new Map<string, number>();
  const userMessage: ChatMessage = { role: "user", content: text };
  messages.push(userMessage);
  await persist(user.id, userMessage);

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await model.chat({ system, messages, tools: session.tools });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.text,
        ...(response.toolCalls.length ? { toolCalls: response.toolCalls } : {}),
      };
      messages.push(assistantMessage);
      await persist(user.id, assistantMessage);

      if (!response.toolCalls.length) {
        return response.text || "…";
      }

      const results: ToolResult[] = [];
      for (const call of response.toolCalls) {
        // A model that repeats an identical failing call burns an LLM request
        // per iteration and ends the turn at the iteration cap with nothing
        // to show for it.
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

        const outcome = await executeGuardedTool(session, user.id, call.name, call.input, {
          userText: text,
        });
        let content = outcome.text || "(empty result)";
        if (content.length > TOOL_RESULT_MAX_CHARS) {
          content =
            content.slice(0, TOOL_RESULT_MAX_CHARS) +
            "\n…(truncated - ask for a narrower query if you need more)";
        }
        results.push({ toolCallId: call.id, content, isError: outcome.isError });
      }

      const resultsMessage: ChatMessage = { role: "tool_results", results };
      messages.push(resultsMessage);
      await persist(user.id, resultsMessage);
    }

    return "That took more steps than expected and I stopped to be safe. Could you rephrase or break the request into smaller parts?";
  } catch (err) {
    if (err instanceof SwiggyAuthError) {
      await invalidateToken(user.id);
      evictMcpSession(token);
      return `Your Swiggy session expired. ${await authLinkMessage(user)}`;
    }
    console.error("[agent] turn failed:", err);
    return "Sorry - something went wrong on my side. Please try that again in a moment.";
  }
}
