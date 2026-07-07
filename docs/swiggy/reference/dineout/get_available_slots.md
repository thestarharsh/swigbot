# get_available_slots

> Swiggy Dineout (Reservations): Check available time slots for TABLE BOOKING at a restaurant. Returns slots across up to 7 days from the requested date. Shows breakfast, lunch, and dinner slots with a...

Swiggy Dineout (Reservations): Check available time slots for TABLE BOOKING at a restaurant. Returns slots across up to 7 days from the requested date. Shows breakfast, lunch, and dinner slots with availability count and associated deals. Date must be in YYYY-MM-DD format (e.g., "2025-11-26") or epoch timestamp. Each slot contains multiple deals - both FREE (isFree=true, bookingPrice=0) and paid/prime deals with discounts. For booking, use FREE deals only (paid deals will be rejected at cart creation). Each slot in the response contains: - dateStr: Date the slot belongs to (YYYY-MM-DD) - slotId: From slot.deals[].slotId - reservationTime: Epoch timestamp (slot.reservationTime) - itemId: From slot.deals[].itemId (format: "restaurantId-ticketId") - displayTime: e.g., "10:00 AM" - slotGroupName: "Breakfast", "Lunch", or "Dinner" - deals[]: Each deal has title, bookingPrice, displayFee, discountPercentage, isFree Example: "What times are available at [Restaurant] on [Date]?" → Call with restaurant ID and date.

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
| `date` | `string` | **yes** | Starting date as YYYY-MM-DD string (e.g., "2025-11-20") or epoch timestamp as numeric string (e.g., "1735689600"). Returns slots for up to 7 days from this date. |
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
