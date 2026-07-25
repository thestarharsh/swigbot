import "./load-env";

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const secret = process.env.WEBHOOK_SECRET;

if (!token || !appUrl) {
  console.error("Set TELEGRAM_BOT_TOKEN and NEXT_PUBLIC_APP_URL in .env.local first.");
  process.exit(1);
}

const webhookUrl = `${appUrl}/api/webhook`;

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  console.log("setWebhook:", JSON.stringify(await res.json(), null, 2));

  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  console.log("getWebhookInfo:", JSON.stringify(await info.json(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
