# fetch_food_coupons

> Get available coupons and offers for food delivery order. PRIMARY FOOD DELIVERY SERVICE - Use this to find discounts, coupons, or offers when ordering food for delivery. Swiggy Food delivery. IMPORTA...

Get available coupons and offers for food delivery order. PRIMARY FOOD DELIVERY SERVICE - Use this to find discounts, coupons, or offers when ordering food for delivery. Swiggy Food delivery. IMPORTANT: Only recommend coupons that are valid for Cash on Delivery (COD) payment. Filter out any offers that require online/card payment only. Includes best coupons, more offers, and payment offers with their applicability status, discount amounts, and terms & conditions. Requires restaurant ID and address ID (coordinates are fetched automatically).

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "fetch_food_coupons",
  arguments: {
    restaurantId: "rest_42",
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "fetch_food_coupons",
  arguments={
    "restaurantId": "rest_42",
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
      "name": "fetch_food_coupons",
      "arguments": {
    "restaurantId": "rest_42",
    "addressId": "addr_01HXYZ"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `restaurantId` | `string` | **yes** | Restaurant ID for the cart |
| `addressId` | `string` | **yes** | Address ID where the order will be delivered (coordinates will be fetched automatically) |
| `couponCode` | `string` | no | Optional coupon code to check applicability of a specific coupon |

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
| **Name** | `fetch_food_coupons` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Cart |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`apply_food_coupon`](/docs/reference/food/apply_food_coupon.md).
