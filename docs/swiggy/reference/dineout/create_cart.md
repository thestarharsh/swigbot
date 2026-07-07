# create_cart

> Swiggy Dineout: Create a cart for TABLE BOOKING or bill payment. For booking (DEAL_TICKET_PURCHASE): requires restaurant ID, slot details, and guest count. Validates billToPay = 0 and skipPayment = t...

Swiggy Dineout: Create a cart for TABLE BOOKING or bill payment. For booking (DEAL_TICKET_PURCHASE): requires restaurant ID, slot details, and guest count. Validates billToPay = 0 and skipPayment = true for free reservations. Note: book_table creates cart internally, so this is only needed for standalone cart operations.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "create_cart",
  arguments: {
    restaurantId: "rest_42",
    cartType: "DEAL_TICKET_PURCHASE",
    latitude: 12.9716,
    longitude: 77.5946,
  },
});
```

**Python**
```py
result = await session.call_tool(
  "create_cart",
  arguments={
    "restaurantId": "rest_42",
    "cartType": "DEAL_TICKET_PURCHASE",
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
      "name": "create_cart",
      "arguments": {
    "restaurantId": "rest_42",
    "cartType": "DEAL_TICKET_PURCHASE",
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
| `cartType` | `"DEAL_TICKET_PURCHASE" \| "DINEOUT"` | **yes** | Cart type: DEAL_TICKET_PURCHASE for booking, DINEOUT for bill payment |
| `latitude` | `number` | **yes** | Latitude |
| `longitude` | `number` | **yes** | Longitude |
| `slotId` | `number` | no | Slot ID (required for booking cart) |
| `itemId` | `string` | no | Item ID (required for booking cart, format: "restaurantId-ticketId") |
| `reservationTime` | `number` | no | Unix timestamp (required for booking cart) |
| `guestCount` | `number` | no | Number of guests (required for booking cart, 1-20) |
| `billAmount` | `number` | no | Bill amount in rupees (required for bill payment cart) |
| `source` | `string` | no | Source for bill payment cart (default: "direct-payment-cart") |

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
| **Name** | `create_cart` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Reserve |
| **Behaviour** | mutating |

## Next in this journey →

Continue with [`book_table`](/docs/reference/dineout/book_table.md).
