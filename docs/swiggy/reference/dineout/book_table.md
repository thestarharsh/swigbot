# book_table

> Swiggy Dineout (Reservations): Book a table at a restaurant for a specific time slot. Only supports FREE reservations (isFree=true, bookingPrice=0). Paid deals will be rejected. Creates a cart then p...

Swiggy Dineout (Reservations): Book a table at a restaurant for a specific time slot. Only supports FREE reservations (isFree=true, bookingPrice=0). Paid deals will be rejected. Creates a cart then proceeds with checkout. Requires slot details from get_available_slots: - slotId: From slot.deals[].slotId - itemId: From slot.deals[].itemId - reservationTime: From slot.reservationTime Returns booking confirmation with order ID. Example: "Book a table for 4 people at 7 PM" → Call with restaurant ID, slot details, guest count, and coordinates.

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
