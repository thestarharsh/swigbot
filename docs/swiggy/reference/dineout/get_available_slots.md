# get_available_slots

Swiggy Dineout (Reservations): Check available time slots for TABLE BOOKING at a restaurant. NOT for food delivery or grocery orders. Returns breakfast, lunch, and dinner slots for up to 7 DAYS starting from the requested date in a single call. the flow handles date switching client-side — do NOT call this tool again when the user picks a different date in the UI. Date must be in YYYY-MM-DD format (e.g., "2026-04-20") or epoch timestamp. Each slot contains deals — FREE (isFree=true) and PAID prebook/prime deals (isFree=false, with a price). Surface BOTH to the user. FREE deals book directly via book_table. PAID deals book via UPI: create_cart (DEAL_TICKET_PURCHASE) → get_payment_options → book_table with paymentMethod="UPI". Each slot in the response contains: - dateStr: Date the slot belongs to (YYYY-MM-DD) - slotId: From slot.deals[].slotId - reservationTime: Epoch timestamp (slot.reservationTime) - itemId: From slot.deals[].itemId (format: "restaurantId-ticketId") - displayTime: e.g., "10:00 AM" - slotGroupName: "Breakfast", "Lunch", or "Dinner" - deals[]: Each deal has title, isFree, bookingPrice (₹ cover charge; bookingPrice&gt;0 / isFree=false means a PAID prebook deal, even if the title reads like a discount), dealCategory, discountPercentage Example: "What times are available at [Restaurant] on [Date]?" → Call with restaurant ID and date. Example: User changes date in UI → Do NOT call this tool again; the UI already has all 7 days loaded. RULES: - If the user confirms a time/date combo visible in the response, TRUST it and call book_table directly. - For dates other than the first, the per-date summary gives meal-type ranges; the structuredContent has the exact slotId/itemId/reservationTime. - Do NOT call get_available_slots again for a different date — the response already contains all 7 days. After showing slots, let the user pick a date and time. Do NOT automatically call book_table — wait for the user to confirm their choice.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_available_slots",
  arguments: {
    restaurantId: "rest_42",
    date: "2026-05-01",
    latitude: 12.9716,
    longitude: 77.5946,
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_available_slots",
  arguments={
    "restaurantId": "rest_42",
    "date": "2026-05-01",
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
      "name": "get_available_slots",
      "arguments": {
    "restaurantId": "rest_42",
    "date": "2026-05-01",
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
| `restaurantId` | `string` | **yes** | Restaurant ID from search or details |
| `date` | `string` | **yes** | Starting date as YYYY-MM-DD string (e.g., "2026-04-20") or epoch timestamp as numeric string (e.g., "1735689600"). Returns slots for up to 7 days from this date. |
| `latitude` | `number` | **yes** | User's latitude |
| `longitude` | `number` | **yes** | User's longitude |

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
data: {
  slots: Array<{
    isFree?: boolean;
    slotId: number;
    displayTime: string;
    reservationTime: number;
    slotGroupName: string;
    availableInventory: number;
    dateStr?: string;
    subText?: string;
    daySubtext?: string;
    price?: number;
    deals: Array<{
      itemId: string;
      ticketId: string;
      slotId: number;
      title?: string;
      discountPercentage?: number;
      coverCharge?: number;
      displayFee?: string;
      bookingPrice?: number;
      isFree?: boolean;
      availableInventory?: number;
      availableInventoryCount?: number;
    }>;
  }>;
  restaurantId: string;
  date: string;
  restaurantName?: string;
  guestCount?: number;
  latitude: number;
  longitude: number;
}
```

This schema documents the structured payload returned by `get_available_slots`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `restaurantId`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `latitude` / `longitude`: coordinates from the selected saved location or restaurant context. Reuse returned values for follow-up slot, tracking, or payment calls; do not infer them from address text.
- `slotId` / `itemId` / `ticketId` / `reservationTime` / `dateStr` / `displayTime`: Dineout slot/deal fields. Copy identifiers from the exact selected slot/deal; do not derive them from display time or restaurant name.
- `isFree` / `bookingPrice` / `coverCharge` / `displayFee`: Dineout payment/price indicators. Paid deals must go through the payment flow; free deals can be booked directly after confirmation.
- `availableInventory` / `availableInventoryCount`: live capacity for the slot/deal. Treat it as time-sensitive and reconfirm if the user waits or changes date/time.
- `price`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_available_slots` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Reserve |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`book_table`](/docs/reference/dineout/book_table.md).
