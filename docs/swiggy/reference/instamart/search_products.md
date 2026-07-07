# search_products

> Search for products available at the selected address. Returns products with their variants (e.g., different pack sizes, quantities). When a user asks to add a product, ALWAYS search first to see ava...

Search for products available at the selected address. Returns products with their variants (e.g., different pack sizes, quantities). When a user asks to add a product, ALWAYS search first to see available variants, then ask the user which specific variant they want before adding to cart. Authentication is handled automatically. Use the addressId from get_addresses.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "search_products",
  arguments: {
    addressId: "addr_01HXYZ",
    query: "biryani",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "search_products",
  arguments={
    "addressId": "addr_01HXYZ",
    "query": "biryani",
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
      "name": "search_products",
      "arguments": {
    "addressId": "addr_01HXYZ",
    "query": "biryani"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `addressId` | `string` | **yes** | Address ID from get_addresses tool |
| `query` | `string` | **yes** | Search query (product name, category, or brand) |
| `offset` | `number` | no | Pagination offset (default: 0) |

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
| **Name** | `search_products` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Discover |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`update_cart`](/docs/reference/instamart/update_cart.md).
