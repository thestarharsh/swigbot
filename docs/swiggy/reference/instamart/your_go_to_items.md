# your_go_to_items

> Fetch the user's Your Go To Items (frequently or recently ordered items) for the selected delivery address. Use addressId from get_addresses. Returns products with variants; use spinId from the chose...

Fetch the user's Your Go To Items (frequently or recently ordered items) for the selected delivery address. Use addressId from get_addresses. Returns products with variants; use spinId from the chosen variant when adding to cart.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "your_go_to_items",
  arguments: {
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "your_go_to_items",
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
      "name": "your_go_to_items",
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
| `addressId` | `string` | **yes** | Address ID from get_addresses tool |
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
| **Name** | `your_go_to_items` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Discover |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`update_cart`](/docs/reference/instamart/update_cart.md).
