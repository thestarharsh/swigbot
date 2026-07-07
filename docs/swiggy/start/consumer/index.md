# Use Swiggy in your AI client

> Paste a config, complete OAuth, and ask your existing AI client to order food. No code required.

If you already use an AI client - Claude Desktop, ChatGPT, Cursor, VS Code, Windsurf - you can add Swiggy as a tool in under two minutes. No code, no framework, no SDK. Paste a config, restart the app, complete OAuth, done.

## What you'll be able to ask

Once installed, try things like:

- "Order biryani for delivery to my home address."
- "What did I order last week on Instamart? Reorder it."
- "Find an Italian restaurant in Koramangala that can seat 4 on Friday at 8pm."
- "Where's my order?"

Your AI client picks the right tool, your Swiggy account places the order.

## Install in your client

[Connect your AI client →](/docs/start/consumer/use-in-ai-client.md)

Six ready-to-paste configurations for Claude Desktop, ChatGPT, Cursor, VS Code, Windsurf, and any other MCP-compatible client.

## What you need

- A Swiggy account (phone number + OTP).
- One of the supported AI clients installed.
- A browser to complete OAuth on first connect.

## What Swiggy sees

- Every tool call is scoped to your authenticated Swiggy user session.
- Addresses, carts, orders are tied to your existing Swiggy account - the AI just orchestrates. You can always verify, modify, or cancel anything in the Swiggy app directly.
- Your AI client provider (Anthropic, OpenAI, etc.) receives your chat messages and tool call results as normal - per their privacy policy. Swiggy's data-handling stance is documented in [data-and-compliance](/docs/operate/data-and-compliance.md).
