import { after, NextRequest, NextResponse } from "next/server";
import { eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ensureUser, runAgentTurn } from "@/lib/agent";
import { messageOf } from "@/lib/mcp/errors";
import { logout } from "@/lib/swiggy-auth";
import { sendMessage, sendTyping } from "@/lib/telegram";

/** A turn runs several LLM and MCP calls. */
export const maxDuration = 60;

const UPDATE_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Share of updates that also sweep old dedupe rows. */
const RETENTION_SWEEP_CHANCE = 0.02;

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

/**
 * This endpoint is public, so without the secret anyone who finds the URL can
 * impersonate Telegram. Next evaluates route modules during `next build`,
 * where no runtime secret is expected, so that phase is exempt.
 */
if (!WEBHOOK_SECRET && process.env.NEXT_PHASE !== "phase-production-build") {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "WEBHOOK_SECRET is not set. Set it in the deployment's environment and re-run " +
        "`pnpm webhook:set`, or the webhook accepts updates from anyone.",
    );
  }
  console.warn("[webhook] WEBHOOK_SECRET is not set - accepting unsigned updates (dev only)");
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    chat: { id: number; type: string };
    /** Absent on photos, voice notes, stickers, documents, locations, … */
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
    console.warn(`[webhook] dedupe write failed, processing anyway: ${messageOf(err)}`);
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
  if (WEBHOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  if (!update || !msg?.from || msg.from.is_bot || msg.chat.type !== "private") {
    return NextResponse.json({ ok: true });
  }

  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const from = msg.from;

  // Telegram retries updates that aren't acked quickly: ack now, work after.
  after(async () => {
    try {
      if (!(await claimUpdate(update.update_id))) return;

      if (!text) {
        // Anything without text used to be dropped without a word, so the
        // user was left waiting on a reply that was never coming.
        await sendMessage(
          chatId,
          "I can only read text messages for now. Type what you'd like to order.",
        );
        return;
      }

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

      // A full-table delete on every message buys nothing; occasional is enough
      // to keep the table bounded.
      if (Math.random() < RETENTION_SWEEP_CHANCE) {
        await db
          .delete(schema.processedUpdates)
          .where(lt(schema.processedUpdates.createdAt, new Date(Date.now() - UPDATE_RETENTION_MS)));
      }
    } catch (err) {
      console.error(`[webhook] failed on update ${update.update_id}:`, err);
      // Left behind, the claim would permanently block a resend of this update.
      await releaseUpdate(update.update_id);
      await sendMessage(chatId, "Sorry - something went wrong. Please try again.").catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
