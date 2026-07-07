const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const TELEGRAM_MAX_LEN = 4096;

async function call(method: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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

/** Telegram 400s on unbalanced Markdown, so failed sends retry as plain text. */
export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  for (const part of chunk(text)) {
    const res = await call("sendMessage", {
      chat_id: chatId,
      text: part,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
    if (!res.ok) {
      await call("sendMessage", { chat_id: chatId, text: part, disable_web_page_preview: true });
    }
  }
}

export async function sendTyping(chatId: number | string): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}
