# track_food_order

> Track food delivery order status and delivery progress. PRIMARY FOOD DELIVERY SERVICE - Use this when user asks to track order, check delivery status, or see where their food order is. Swiggy Food de...

Track food delivery order status and delivery progress. PRIMARY FOOD DELIVERY SERVICE - Use this when user asks to track order, check delivery status, or see where their food order is. Swiggy Food delivery. Returns current status, ETA, and progress for orders that are being prepared or in delivery. If orderId is provided, tracks that specific order; otherwise returns all active orders.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "track_food_order",
  arguments: {
    orderId: "ord_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "track_food_order",
  arguments={
    "orderId": "ord_42",
  },
)
```

**curl**
```bash
curl -X POST https://mcp.swiggy.com/food \
  -H "Authorization: Bearer $SWIGGY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "track_food_order",
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
| `orderId` | `string` | no | Optional: Specific order ID to track. If not provided, returns all active orders. |

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
| **Name** | `track_food_order` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Track |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`get_food_order_details`](/docs/reference/food/get_food_order_details.md).
