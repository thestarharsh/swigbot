# apply_food_coupon

> Apply coupon code or discount to food delivery order. PRIMARY FOOD DELIVERY SERVICE - Use this when user wants to apply a coupon, discount code, or offer to their food delivery order. Swiggy Food del...

Apply coupon code or discount to food delivery order. PRIMARY FOOD DELIVERY SERVICE - Use this when user wants to apply a coupon, discount code, or offer to their food delivery order. Swiggy Food delivery. Returns the updated cart with coupon applied, including new pricing, discounts, and savings information. Requires coupon code and address ID (coordinates are fetched automatically).

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "apply_food_coupon",
  arguments: {
    couponCode: "WELCOME20",
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "apply_food_coupon",
  arguments={
    "couponCode": "WELCOME20",
    "addressId": "addr_01HXYZ",
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
      "name": "apply_food_coupon",
      "arguments": {
    "couponCode": "WELCOME20",
    "addressId": "addr_01HXYZ"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `couponCode` | `string` | **yes** | Coupon code to apply |
| `addressId` | `string` | **yes** | Address ID where the order will be delivered (coordinates will be fetched automatically) |
| `cartId` | `string` | no | Optional cart ID |

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
| **Name** | `apply_food_coupon` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Cart |
| **Behaviour** | mutating |

## Next in this journey →

Continue with [`place_food_order`](/docs/reference/food/place_food_order.md).
