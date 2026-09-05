# apply_coupon

Swiggy Instamart (Grocery): Apply a coupon code to the current Instamart cart. Returns the updated cart with the discount reflected in the bill breakdown — same structure as get_cart / update_cart. Use list_coupons first to discover valid coupon codes.

Authentication is handled automatically.

## Usage notes

- This tool is not completely rolled out yet; it may not appear in `tools/list` for every user or account.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "apply_coupon",
  arguments: {
    couponCode: "WELCOME20",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "apply_coupon",
  arguments={
    "couponCode": "WELCOME20",
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
      "name": "apply_coupon",
      "arguments": {
    "couponCode": "WELCOME20"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `couponCode` | `string` | **yes** | REQUIRED: The coupon code to apply (e.g. "SAVE100", "FREEDEL"). Case-insensitive — will be uppercased automatically. |

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
data: InstamartCart
```

The cart shape is the same as `get_cart`, with the coupon discount reflected in `billBreakdown.lineItems`.

### Schema notes

- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `apply_coupon` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Cart |
| **Behaviour** | mutating |

## Next in this journey →

Continue with [`checkout`](/docs/reference/instamart/checkout.md).
