# book_table

Swiggy Dineout (Reservations): Book a table at a restaurant for a specific time slot. NOT for food delivery or grocery orders. Books FREE reservations directly, and PAID prebook deals via UPI. FREE deal (isFree=true): pass slot details only — book_table creates the cart and confirms in one step. PAID deal (isFree=false): first call create_cart (cartType="DEAL_TICKET_PURCHASE") to create the cart — it shows a Booking Summary and STOPS. Only after the user taps "Proceed to payment" do you show payment methods; let the user pick a UPI app, then call book_table with paymentMethod="UPI", the chosen intentApp, and the cartKey from create_cart. It returns PENDING_PAYMENT — then poll check_payment_status and call confirm_order. Requires slot details from get_available_slots: slotId, itemId, reservationTime. Returns booking confirmation with order ID. 

CONFIRMATION RULES: 
- If the user message starts with "Confirm booking:" — they already confirmed via the booking UI. Call book_table IMMEDIATELY without showing a summary or asking again. 
- If the user types a booking request manually (e.g. "Book a table for 2 at 7 PM"), show a brief summary and ask for confirmation before calling book_table. 

SLOT MATCHING RULES — read before responding to user: 
1. When the user message names a specific date + time (e.g. "Book a table for 2 guests at 02:30 PM on 2026-04-18"), look up THAT SPECIFIC date in the previous get_available_slots response per-date summary. DO NOT use the first-date summary or today's summary to decide availability for a different date. 
2. If the per-date summary for the requested date shows a matching meal window (e.g. "2026-04-18: Lunch (12:00 PM–4:45 PM, 20 slots)"), the slot EXISTS — every 15-minute time within the range is bookable. TRUST the returned slot data — do NOT tell the user "that time is not available". 
3. Find the matching slot in get_available_slots response: slot with dateStr=requested-date AND displayTime=requested-time. Use the deal the user chose (free or paid) from that slot — read its slotId, itemId, and the slot's reservationTime. Pass those EXACT values to book_table (for a paid deal, also pass paymentMethod="UPI", intentApp, and cartKey). 
4. Pass restaurantId, latitude, longitude from the previous search_restaurants_dineout or get_restaurant_details response. 

Cancellation: if cancel_booking is available for the user's account, use it only after the user confirms cancellation. Otherwise, direct the user to manage the booking in the Swiggy app.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "book_table",
  arguments: {
    restaurantId: "rest_42",
    slotId: 4242,
    itemId: "rest_42-ticket_7",
    reservationTime: 1735675200,
    guestCount: 2,
    latitude: 12.9716,
    longitude: 77.5946,
  },
});
```

**Python**
```py
result = await session.call_tool(
  "book_table",
  arguments={
    "restaurantId": "rest_42",
    "slotId": 4242,
    "itemId": "rest_42-ticket_7",
    "reservationTime": 1735675200,
    "guestCount": 2,
    "latitude": 12.9716,
    "longitude": 77.5946,
  },
)
```

**curl**
```bash
curl -X POST https://mcp.swiggy.com/dineout \
  -H "Authorization: Bearer $SWIGGY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "book_table",
      "arguments": {
    "restaurantId": "rest_42",
    "slotId": 4242,
    "itemId": "rest_42-ticket_7",
    "reservationTime": 1735675200,
    "guestCount": 2,
    "latitude": 12.9716,
    "longitude": 77.5946
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `restaurantId` | `string` | **yes** | Restaurant ID |
| `slotId` | `number` | **yes** | Slot ID from selected slot (slot.deals[].slotId) |
| `itemId` | `string` | **yes** | Deal/ticket item ID (slot.deals[].itemId, format: "restaurantId-ticketId") |
| `reservationTime` | `number` | **yes** | Unix timestamp from selected slot (slot.reservationTime) |
| `guestCount` | `number` | **yes** | Number of guests (1-20) |
| `latitude` | `number` | **yes** | Latitude from user address |
| `longitude` | `number` | **yes** | Longitude from user address |
| `paymentMethod` | `"Cash" \| "UPI"` | no | Omit (or "Cash") for FREE reservations. Use "UPI" for paid prebook deals (also pass cartKey + intentApp). |
| `cartKey` | `string` | no | Paid UPI prebook only: cartKey returned by create_cart (DEAL_TICKET_PURCHASE). |
| `intentApp` | `string` | no | Paid UPI prebook only: the UPI app id chosen from get_payment_options. Omit when generateUPIQR=true. |
| `generateUPIQR` | `boolean` | no | Paid UPI prebook on desktop: true for a scannable QR instead of an app intent. |

Session credentials (user identity, access token) are supplied automatically by the authenticated MCP session - you do not pass them in the tool call. See [Authenticate](/docs/start/authenticate.md).

## Response

All Swiggy MCP tools return:

```json
{
  "success": true,
  "data": { /* tool-specific payload */ },
  "message": "optional human-readable message"
}
```

On failure:

```json
{
  "success": false,
  "error": { "message": "description of what went wrong" }
}
```

See [Error codes](/docs/reference/errors.md) for the full catalogue.

### Output schema

```ts
data:
  | {
      orderId: string;
      isDineout: true;
      restaurantId: string;
      restaurantName: string;
      restaurantLocation?: string;
      reservationDate: string;
      reservationTime: string;
      guestCount: number;
      status: string;
    }
  | {
      orderId: string;
      paasId: string;
      transactionId: string;
      upiIntentUrl: string;
      bridgeUrl: string;
      isQrFlow: boolean;
      pollingIntervalInMs: number;
      maxTimeToPollForInMs: number;
      paymentMethod: "UPI";
      status: "PENDING_PAYMENT";
      isDineout: true;
      restaurantName?: string;
      restaurantLocation?: string;
      reservationDate?: string;
      reservationTime?: string;
      guestCount?: number;
    }
```

This schema documents the structured payload returned by `book_table`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `restaurantId`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `status`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `paasId` / `transactionId` / `upiIntentUrl` / `bridgeUrl` / `isQrFlow` / `paymentMethod`: payment-flow fields for UPI/Cash flows. Payment IDs are used for polling/confirmation; `isQrFlow=true` means the user is expected to complete payment through a scan-QR path.
- `pollingIntervalInMs` / `maxTimeToPollForInMs`: polling hints for status refreshes. Do not poll faster than the returned interval; stop when a terminal status is returned.
- `reservationTime`: Dineout slot/deal fields. Copy identifiers from the exact selected slot/deal; do not derive them from display time or restaurant name.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `book_table` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Reserve |
| **Behaviour** | mutating |

## Next in this journey →

Continue with [`get_booking_status`](/docs/reference/dineout/get_booking_status.md).
