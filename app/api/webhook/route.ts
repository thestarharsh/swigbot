import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, runAgentTurn } from "@/lib/agent";
import { logout } from "@/lib/swiggy-auth";
import { sendMessage, sendTyping } from "@/lib/telegram";

/** A turn runs several LLM and MCP calls. */
export const maxDuration = 60;

const UPDATE_RETENTION_MS = 24 * 60 * 60 * 1000;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    chat: { id: number; type: string };
    text?: string;
  };
}

/**
 * The insert is the lock, so a redelivery cannot be processed twice across
 * instances. Fails open: the ack already went out, so a lost reply would cost
 * more than the duplicate this guards against.
 */
async function claimUpdate(updateId: number): Promise<boolean> {
  try {
    const inserted = await db
      .insert(schema.processedUpdates)
      .values({ updateId })
      .onConflictDoNothing()
      .returning({ updateId: schema.processedUpdates.updateId });
    return inserted.length > 0;
  } catch (err) {
    console.warn(`[webhook] dedupe write failed, processing anyway: ${
      err instanceof Error ? err.message : err
    }`);
    return true;
  }
}

async function releaseUpdate(updateId: number): Promise<void> {
  await db
    .delete(schema.processedUpdates)
    .where(eq(schema.processedUpdates.updateId, updateId))
    .catch(() => {});
}

export async function POST(req: NextRequest) {
  if (
    process.env.WEBHOOK_SECRET &&
    req.headers.get("x-telegram-bot-api-secret-token") !== process.env.WEBHOOK_SECRET
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  if (!update || !msg?.text || !msg.from || msg.from.is_bot || msg.chat.type !== "private") {
    return NextResponse.json({ ok: true });
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const from = msg.from;

  // Telegram retries updates that aren't acked quickly: ack now, work after.
  after(async () => {
    try {
      if (!(await claimUpdate(update.update_id))) return;

      await sendTyping(chatId);
      const user = await ensureUser("telegram", String(chatId), from.first_name ?? from.username);

      if (text === "/logout") {
        await logout(user.id);
        await sendMessage(
          chatId,
          "Done. Your Swiggy account has been unlinked. Send /start to link again.",
        );
        return;
      }

      const reply = await runAgentTurn(user, "telegram", text === "/start" ? "Hi!" : text);
      await sendMessage(chatId, reply);

      await db
        .delete(schema.processedUpdates)
        .where(lt(schema.processedUpdates.createdAt, new Date(Date.now() - UPDATE_RETENTION_MS)));
    } catch (err) {
      console.error(`[webhook] failed on update ${update.update_id}:`, err);
      // Left behind, the claim would permanently block a resend of this update.
      await releaseUpdate(update.update_id);
      await sendMessage(chatId, "Sorry - something went wrong. Please try again.").catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
