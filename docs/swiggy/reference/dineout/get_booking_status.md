# get_booking_status

Swiggy Dineout (Reservations): Get booking status and details for a dineout reservation. NOT for food delivery or grocery orders. Returns restaurant name, booking date and time, guest count, deal title, and current status (confirmed/cancelled/completed). Use this when the user asks about their reservation status, booking details, or wants to check if their table is still confirmed. Example: "What is the status of my booking?" → Call with order ID. Example: "Is my reservation still on?" → Call with order ID from previous book_table response. 

Cancellation: if cancel_booking is available for the user's account, use it only after the user confirms cancellation. Otherwise, direct the user to manage the booking in the Swiggy app.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_booking_status",
  arguments: {
    orderId: "ord_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_booking_status",
  arguments={
    "orderId": "ord_42",
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
      "name": "get_booking_status",
      "arguments": {
    "orderId": "ord_42"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `orderId` | `string` | **yes** | Order ID from booking confirmation |

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
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  dealTitle: string;
  status: string;
  canCancel: boolean;
}
```

This schema documents the structured payload returned by `get_booking_status`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `restaurantId`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `status`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `reservationTime`: Dineout slot/deal fields. Copy identifiers from the exact selected slot/deal; do not derive them from display time or restaurant name.
- `canCancel`: cancellation fields. Ask for user confirmation before calling a cancellation tool.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_booking_status` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Manage |
| **Behaviour** | read-only |
