import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ensureUser, runAgentTurn } from "@/lib/agent";
import { logout } from "@/lib/swiggy-auth";
import { sendMessage, sendTyping } from "@/lib/telegram";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    chat: { id: number; type: string };
    text?: string;
  };
}

// Telegram retries updates that aren't acked quickly, so we ack instantly,
// process after the response, and drop update_ids we've already seen.
const seenUpdates = new Set<number>();

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

  if (seenUpdates.has(update.update_id)) return NextResponse.json({ ok: true });
  seenUpdates.add(update.update_id);
  if (seenUpdates.size > 2000) seenUpdates.clear();

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const from = msg.from;

  after(async () => {
    try {
      await sendTyping(chatId);
      const user = await ensureUser("telegram", String(chatId), from.first_name ?? from.username);

      if (text === "/logout") {
        await logout(user.id);
        await sendMessage(chatId, "Done. Your Swiggy account has been unlinked. Send /start to link again.");
        return;
      }

      const input = text === "/start" ? "Hi!" : text;
      const reply = await runAgentTurn(user, "telegram", input);
      await sendMessage(chatId, reply);
    } catch (err) {
      console.error("[webhook] failed:", err);
      await sendMessage(chatId, "Sorry - something went wrong. Please try again.").catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
