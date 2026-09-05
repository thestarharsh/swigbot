# get_addresses

Swiggy (Instamart/Food): Get saved delivery addresses for the authenticated Swiggy user, sorted by last order date (most recent first). This tool works for Swiggy Instamart and Food services. Addresses are returned WITHOUT coordinates (latitude/longitude) for privacy protection. Authentication is handled automatically.

📄 PAGINATION: Results are returned one page at a time (10 addresses per page). The response includes a "pagination" object (&#123; page, pageSize, total, totalPages, hasMore &#125;). If hasMore is true and the user has not found the address they want, call this tool again with the next page number (e.g. page=2) to fetch more.

📍 IMPORTANT — STOP here and let the user choose:
1. Show the address list to the user
2. Ask: "Which address would you like to use for delivery?"
3. Do NOT call any other tool until the user has selected an address
4. Remember the selected addressId for all subsequent operations
5. If no addresses are returned, inform the user that they need to add an address first

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_addresses",
  arguments: {
    page: 0,
    pageSize: 0,
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_addresses",
  arguments={
    "page": 0,
    "pageSize": 0,
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
      "name": "get_addresses",
      "arguments": {
    "page": 0,
    "pageSize": 0
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `page` | `number` | no | Page number for pagination, 1-based (default: 1) |
| `pageSize` | `number` | no | Number of addresses per page (default: 10, max: 10) |

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
  addresses: Array<{
    id: string;
    addressLine: string;
    phoneNumber: string;
    addressCategory?: string;
    addressTag?: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
```

This schema documents the structured payload returned by `get_addresses`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `id`: stable identifier for a saved Swiggy delivery address. Use the returned ID in cart, checkout, and payment calls instead of reusing the human-readable address text.
- `hasMore` / `page` / `pageSize` / `totalPages`: pagination fields. Use them only to fetch or display more results from the same query/list; do not treat page numbers as item IDs.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_addresses` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Discover |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`search_products`](/docs/reference/instamart/search_products.md).
