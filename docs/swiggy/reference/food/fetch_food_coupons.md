# fetch_food_coupons

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

### Output schema

```ts
data: {
  status_message?: string;
  coupon_sections: Array<{
    title?: string;
    type?: string;
    coupons: Array<{
      id?: string;
      applicable?: boolean;
      applicabilityStatus?: "APPLICABLE" | "APPLIED" | "NOT_APPLICABLE" | string;
      title?: string;
      subtitle?: string;
      description?: string;
      ribbon_text?: string;
      terms_and_conditions?: {
        title?: string;
        bullet_texts?: string[];
      } | null;
    }>;
  }>;
  summary: {
    total_coupons: number;
    applicable_coupons: number;
    sections_count: number;
    filter_applied?: string;
  };
}
```

The coupons service returns a trimmed coupon/offers payload. Coupon cards can vary by restaurant, campaign, and cart state.

### Schema notes

- `applicable`: `true` means the coupon can be applied to the current cart.
- `applicabilityStatus`: when present, `APPLICABLE` means the coupon can be applied, `APPLIED` means it is already applied to the cart, and `NOT_APPLICABLE` means the coupon is visible but cannot be used for the current cart.
- `filter_applied`: describes any public filter applied to the returned offers, such as COD-compatible offers.
- `applicabilityStatus` / `applicable`: coupon visibility/application fields. Treat a coupon as applied only when the returned cart shows an applied coupon/code and a positive discount where available.
- `summary`: support-report fields. Show the summary so the user understands what will be sent.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

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
