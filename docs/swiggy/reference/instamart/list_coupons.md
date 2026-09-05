# list_coupons

Swiggy Instamart (Grocery): List available coupons for the current cart. Fetches applicable coupon offers based on the items in your cart and delivery address. Call this before checkout to discover available discounts.

⚠️ REQUIRED WORKFLOW:
1. Call get_addresses to get a valid addressId
2. Add items to cart using update_cart (cart must be non-empty)
3. Call list_coupons with the addressId
4. Show available coupons to the user
5. Use apply_coupon to apply the selected coupon code

Authentication is handled automatically.

## Usage notes

- This tool is not completely rolled out yet; it may not appear in `tools/list` for every user or account.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "list_coupons",
  arguments: {
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "list_coupons",
  arguments={
    "addressId": "addr_01HXYZ",
  },
)
```

**curl**
```bash
curl -X POST https://mcp.swiggy.com/im \
  -H "Authorization: Bearer $SWIGGY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_coupons",
      "arguments": {
    "addressId": "addr_01HXYZ"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `addressId` | `string` | **yes** | REQUIRED: Delivery address ID from get_addresses. Used to determine location-specific coupon availability. |

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
  availableCoupons: Array<{
    couponCode: string;
    title: string;
    description?: string;
    isApplicable: boolean;
    applicabilityStatus: string;
    applicabilityMessage?: string;
    tnc?: { title: string; bulletTexts?: string[] };
    offerId?: string;
  }>;
}
```

This schema documents the structured payload returned by `list_coupons`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `couponCode` / `applicabilityStatus` / `isApplicable`: coupon visibility/application fields. Treat a coupon as applied only when the returned cart shows an applied coupon/code and a positive discount where available.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `list_coupons` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Cart |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`apply_coupon`](/docs/reference/instamart/apply_coupon.md).
