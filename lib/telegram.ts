const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const TELEGRAM_MAX_LEN = 4096;

async function call(method: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Messages go out as plain text. Telegram's legacy Markdown treats `_` and `*`
 * as emphasis delimiters and strips them from the delivered text, which
 * silently corrupts OAuth login URLs (`response_type` arrived as
 * `responsetype`). Emphasis markers are removed here so they don't surface as
 * literal punctuation; underscores are left untouched. Telegram still
 * auto-links bare URLs without a parse mode.
 */
export function toPlainText(text: string): string {
  return text
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .trim();
}

function chunk(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LEN) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > TELEGRAM_MAX_LEN) {
    let cut = rest.lastIndexOf("\n", TELEGRAM_MAX_LEN);
    if (cut < TELEGRAM_MAX_LEN / 2) cut = TELEGRAM_MAX_LEN;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  for (const part of chunk(toPlainText(text))) {
    const res = await call("sendMessage", {
      chat_id: chatId,
      text: part,
      disable_web_page_preview: true,
    });
    if (!res.ok) {
      console.error(`[telegram] sendMessage ${res.status}: ${await res.text()}`);
    }
  }
}

export async function sendTyping(chatId: number | string): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}
