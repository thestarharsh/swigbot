# Voice vs chat

> The same Swiggy tool, different response contracts. Design for TTS and rich cards separately.

A `search_restaurants` response that works great in Claude's chat UI (long list, rich cards, ratings, distances) is a disaster on a car's voice assistant - it'll read 18 restaurant names while the user tries to change lanes.

Voice and chat surfaces want different things from the same tool. Your agent's job is to shape the answer for its surface.

## When to assume voice

You're on voice if any of these are true:

- The client is a car, TV, smart speaker, or ambient surface.
- The response will be TTS-rendered without a screen.
- The user typed no input (they spoke).
- Your framework's surface metadata says voice (some frameworks expose `ctx.surface === "voice"`).

Otherwise, assume chat: a visible screen, the user can scan, widgets help.

## Voice response contract

Your system prompt should include something like:

> **Note**
>
> You are on a voice surface. Your responses will be spoken, not shown. Follow these rules:
> 
> - **Maximum 3 items** in any list you read aloud. Summarise "+ 5 more" if there are more.
> - Say **prices in Indian rupees** aloud - "₹249" → "two hundred and forty-nine rupees".
> - Spell out **delivery times** naturally - "35-40 MINS" → "about 40 minutes".
> - **Confirm before acting**: always say back the cart total and delivery time before calling `place_food_order`. Wait for "yes".
> - **Never read tool IDs aloud** - `addressId`, `restaurantId`, `spinId` are never voice-appropriate.
> - Default to the user's **saved Home address** without asking, unless they said otherwise.

## Chat response contract

```
You are on a chat surface (Claude, ChatGPT, or similar). Your responses will
be rendered with markdown and may include widgets.

- Present up to 8 restaurants in a search result as a concise list with
  name, cuisine, rating, distance, delivery time.
- Use the widget returned alongside search_restaurants (restaurant-card) when
  your client supports rendering it.
- Show cart items as a markdown table with item, quantity, price, total.
- Still confirm before place_food_order, but in text ("Confirm order? Reply
  yes to place.").
```

## Sample voice exchange

```
User:   Order biryani
Agent:  I found two options near your home address. The closest is Biryani
        House, about 30 minutes, forty-nine rupees off with a welcome
        coupon. Want that one?
User:   Yes
Agent:  One chicken biryani from Biryani House. Total four hundred and sixty
        nine rupees, cash on delivery. Confirm to place?
User:   Confirm
Agent:  Placed. You'll see delivery updates in the Swiggy app.
```

## Sample chat exchange

```markdown
**User**: Order biryani

**Agent**:

I found these near your home:

| Restaurant       | Rating | Distance | Delivery |
|------------------|--------|----------|----------|
| Biryani House    | 4.5 ★  | 2.1 km   | 30 min   |
| Paradise Biryani | 4.3 ★  | 3.8 km   | 40 min   |
| Kebab Factory    | 4.4 ★  | 5.2 km   | 45 min   |

[Restaurant card widget for Biryani House]

Which one?
```

## Tool-selection differences

Some tools are more useful on voice than chat:

| Tool | Voice | Chat |
| --- | --- | --- |
| `your_go_to_items` (Instamart reorder) | **Perfect** - "reorder your usual?" one-shot | Also good, but search is fine on screen |
| `search_menu` with many results | Compress to top 3 | Show up to 10 |
| `fetch_food_coupons` | Read top 1 | Show whole list |
| `track_food_order` | Say ETA only | Show full timeline |

## What Swiggy does for you

Tool responses include fields optimized for both surfaces:

- `shortDescription` (voice-friendly, 1 sentence)
- `longDescription` (chat-friendly, includes structured data)
- `deliveryTimeSpoken` (e.g. "about 30 minutes") vs `deliveryTimeRange` (e.g. "25-35 MIN")

Use the right field for your surface.

## Guardrails common to both

- **Never autonomously place an order** without user confirmation. Surfaces differ in the *shape* of the confirmation, not its necessity.
- **Always surface distance** for far restaurants (>5 km on Food, >10 km on Dineout).
- **Respect the ₹1000 cart cap** on Food; tell the user before they pick an 8th item they can't afford.
- **Never read raw IDs, tokens, or internal codes** aloud or in screen UI.
