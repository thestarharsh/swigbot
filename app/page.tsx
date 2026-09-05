export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "4rem", maxWidth: 640 }}>
      <h1>🛵 SwigBot</h1>
      <p>
        Conversational commerce agent for Swiggy MCP (Food, Instamart, Dineout). This service has no
        web UI - talk to the bot on Telegram, or run <code>pnpm cli</code> for a local chat.
      </p>
    </main>
  );
}
