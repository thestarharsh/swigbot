import "./load-env";

import { call } from "../lib/telegram";
import { messageOf } from "../lib/mcp/errors";

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const secret = process.env.WEBHOOK_SECRET;

if (!token || !appUrl) {
  console.error("Set TELEGRAM_BOT_TOKEN and NEXT_PUBLIC_APP_URL in .env.local first.");
  process.exit(1);
}

// Registering without one leaves the endpoint open to anyone who guesses the
// URL, and the route refuses to start without it in production anyway.
if (!secret) {
  console.error(
    "Set WEBHOOK_SECRET in .env.local (any random string) before registering the webhook.\n" +
      "  openssl rand -hex 24",
  );
  process.exit(1);
}

async function main() {
  const res = await call("setWebhook", {
    url: `${appUrl}/api/webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  console.log("setWebhook:", JSON.stringify(await res.json(), null, 2));

  const info = await call("getWebhookInfo", {});
  console.log("getWebhookInfo:", JSON.stringify(await info.json(), null, 2));
}

main().catch((err) => {
  console.error("✗ set-webhook failed:", messageOf(err));
  process.exit(1);
});
