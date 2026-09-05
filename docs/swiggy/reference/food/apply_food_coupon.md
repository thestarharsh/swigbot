# apply_food_coupon

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

### Output schema

```ts
data: {
  statusCode?: number;
  statusMessage?: string;
  data?: {
    cart_id?: string;
    result?: string;
    pricing?: {
      item_total?: number;
      delivery_fee?: number;
      packaging_fee?: number;
      taxes?: number;
      coupon_discount?: number;
      to_pay?: number;
    };
    offers?: {
      coupon_applied?: string;
      coupon_discount?: number;
    };
    item_count?: number;
  };
}
```

The returned cart reflects the attempted coupon application. Treat a coupon as applied only when the response indicates a coupon code and a positive coupon discount.

### Schema notes

- `coupon_applied`: coupon code reflected on the returned cart.
- `coupon_discount`: discount amount in rupees. Treat the coupon as actually applied only when this is greater than `0`.
- `to_pay`: final payable amount after cart charges and discounts.
- `cart_id`: server-side cart reference for the current authenticated session. Use it only for the immediate follow-up flow; refresh the cart if the user changes items, address, slot, or payment path.
- `item_total` / `to_pay`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `delivery_fee` / `packaging_fee`: component charge fields. Use the final payable total for checkout decisions rather than summing components yourself.
- `coupon_applied` / `coupon_discount`: coupon visibility/application fields. Treat a coupon as applied only when the returned cart shows an applied coupon/code and a positive discount where available.
- `statusCode` / `statusMessage`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

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
