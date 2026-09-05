# Pay in Chat: UPI Payments Come to Swiggy MCP

> Swiggy MCP now supports in-chat UPI payments across Food, Instamart, and Dineout - one payment picker, device-aware UPI intent and scan-QR, and a status flow that finalizes orders safely without your agent babysitting a poll loop.

> **Pay without leaving the conversation.** Swiggy MCP now exposes a shared **Payment** stage - `get_payment_options`, `check_payment_status`, and `confirm_order` - across all three servers: **Food**, **Instamart**, and **Dineout**. Your agent can take a user from cart to paid order entirely in chat, with UPI.

Until now, MCP orders settled on Cash. With this release, an agent built on Swiggy MCP can offer real UPI payment - GPay, PhonePe, Paytm, and scan-QR - and finalize the order the moment payment succeeds. The whole flow is three small tools bolted onto the journey you already know.

## The flow in one picture

```
get_cart / get_food_cart / create_cart
              │
              ▼
     get_payment_options ─────────────► renders the payment picker widget
              │
              ▼
   checkout / place_food_order / book_table   (user's pick → intentApp or QR)
              │                                 order created in PENDING_PAYMENT
              ▼
     check_payment_status  ◄── the widget polls this automatically
              │
              ▼
        confirm_order       ─────────► PENDING_PAYMENT → PLACED (or FAILED)
              │
              ▼
   track_order / track_food_order / get_booking_status
```

## One call, one picker, any device

Call [`get_payment_options`](/docs/reference.md) when the user is ready to pay (the same tool exists on every server — Food, Instamart, Dineout). A single call fetches **both** device surfaces - mobile UPI apps (intent) and desktop scan-QR - and merges them into one picker widget. The widget auto-detects the user's device and shows the matching options, with the rest under "Show more". **You don't have to ask the user what device they're on.**

`get_payment_options` is the source of truth — the returned list is always exactly what the user can pay with for this cart. When UPI isn't available, the picker gracefully falls back to Cash.

The user picks a method; you hand that choice straight to the place-order tool:

- **UPI app** → pass the method `id` byte-for-byte as `intentApp`.
- **Desktop scan-QR** → set `generateUPIQR=true` (no `intentApp`).

## The order is created, but not final - by design

For UPI flows, `checkout` / `place_food_order` / `book_table` create the order in a **`PENDING_PAYMENT`** state. It becomes `PLACED` only after payment actually succeeds. That's what keeps an unpaid order from ever looking placed.

Two tools drive the transition:

- [`check_payment_status`](/docs/reference.md) reads the live payment state (SUCCESS / PENDING / FAILED / REFUND-INITIATED).
- [`confirm_order`](/docs/reference.md) finalizes: `PENDING_PAYMENT → PLACED` on success, or marks the order failed on failure/timeout so it never lingers.

## Your agent doesn't babysit the poll loop

Here's the part builders like most: **the confirmation widget polls `check_payment_status` for you and auto-finalizes the order server-side on any terminal outcome** - confirming it on success, marking it failed on failure or timeout. In the normal path your agent doesn't call either tool - it places the order and the widget takes it home.

That matters because `check_payment_status` is a **long-poll** against the payment cache (the server holds the connection ~19s, returning early on a status change). An agent that tight-loops it just hammers that cache - slowing payments down for everyone - for no benefit, since the widget already owns the cadence. So the guidance is simple:

- Don't poll. The widget owns the cadence and the wall-clock cap.
- Only call `check_payment_status` if the user explicitly asks "did my payment go through?" - and then call it **once**.
- On terminal `SUCCESS` the order is already confirmed for you server-side - only call `confirm_order` yourself if the result says auto-confirm couldn't run. On `FAILED`, don't confirm - re-show the picker with `get_payment_options` for a fresh attempt.
- If you *do* run your own poll loop (no widget), cap it: at your cap while still pending, call `confirm_order` once to finalize - don't loop forever.

`confirm_order` is **idempotent** — a retry after a transient error is always safe, and it never places an unpaid order. (Instamart and Dineout reconcile via the `paasId`; Food via its address-based confirm contract, which doesn't use `paasId`.)

## Per-server contract at a glance

The Payment stage is shared, but each server echoes back the identifiers its confirm contract needs. Echo them from the place-order response - don't reconstruct them.

| Server | `get_payment_options` | `check_payment_status` | `confirm_order` |
| --- | --- | --- | --- |
| **Instamart** | `POST /im` | `paasId` (+ `orderId`) | `orderId` + `paasId` |
| **Food** | `POST /food` (+ `addressId`) | `paasId` (+ `orderId`, `addressId`, `lat`, `lng`) | `orderId` + `addressId` + `lat` + `lng` |
| **Dineout** | `POST /dineout` | `paasId` (+ `orderId`) | `orderId` + `paasId` |

The `paasId` is the canonical payment-transaction reference for Instamart and Dineout. Food's confirm contract is address-based and does not use `paasId`.

## Compliance and safety, built in

- **NPCI compliance**: UPI Collect and saved VPAs are never surfaced. Don't ask the user for a VPA.
- **No unpaid orders**: the `PENDING_PAYMENT` gate means an order only becomes `PLACED` after payment is confirmed.
- **No stuck orders**: at the polling cap, a still-pending order is marked failed; a late payment success is reconciled server-side.

## Start building

- Reference: the shared **Payment stage** — `get_payment_options`, `check_payment_status`, `confirm_order` — on every server's [reference page](/docs/reference.md)
- Browse the [Payment stage](/docs/reference.md) on any server (Food, Instamart, Dineout)
- Questions? Write to us: [builders@swiggy.in](mailto:builders@swiggy.in)
