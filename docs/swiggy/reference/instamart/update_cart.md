# update_cart

Swiggy Instamart (Grocery): Update Swiggy Instamart grocery cart with items. Replaces entire cart with the provided items. Use this for Instamart grocery orders, NOT for Food delivery. Authentication is handled automatically. Use addressId from get_addresses.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "update_cart",
  arguments: {
    selectedAddressId: "...",
    items: [{ "spinId": "spin_42", "skuId": "sku_88", "quantity": 1 }],
  },
});
```

**Python**
```py
result = await session.call_tool(
  "update_cart",
  arguments={
    "selectedAddressId": "...",
    "items": [{ "spinId": "spin_42", "skuId": "sku_88", "quantity": 1 }],
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
      "name": "update_cart",
      "arguments": {
    "selectedAddressId": "...",
    "items": [{ "spinId": "spin_42", "skuId": "sku_88", "quantity": 1 }]
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `selectedAddressId` | `string` | **yes** | Selected delivery address ID from get_addresses tool |
| `items` | `object[]` | **yes** | Array of items to add to cart |

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
data: InstamartCart & {
  removedOutOfStockItems?: InstamartCartItem[];
  reducedQuantityItems?: Array<{
    spinId: string;
    itemName: string;
    requestedQuantity: number;
    cappedQuantity: number;
    reason?: string;
  }>;
}
```

The base cart shape is the same as `get_cart`.

### Schema notes

- `spinId`: Instamart product/SKU identifiers. Use returned SKU-level IDs from the selected product variation when updating an Instamart cart; product-level IDs identify the broader product family.
- `reducedQuantityItems`: live availability fields. If an item is out of stock, unserviceable, or quantity-capped, show the returned reason/message and refresh before checkout.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `update_cart` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Cart |
| **Behaviour** | mutating |

## Next in this journey →

Continue with [`get_cart`](/docs/reference/instamart/get_cart.md).
