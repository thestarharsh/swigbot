# get_addresses

> Swiggy (Instamart/Food): Get all saved delivery addresses for the authenticated Swiggy user, sorted by last order date. This tool works for Swiggy Instamart and Food services. Addresses are returned ...

Swiggy (Instamart/Food): Get all saved delivery addresses for the authenticated Swiggy user, sorted by last order date. This tool works for Swiggy Instamart and Food services. Addresses are returned WITHOUT coordinates (latitude/longitude) for privacy protection. No parameters needed - authentication is handled automatically.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_addresses",
  arguments: {},
});
```

**Python**
```py
result = await session.call_tool(
  "get_addresses",
  arguments={},
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
      "name": "get_addresses",
      "arguments": {}
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |

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
| **Name** | `get_addresses` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Discover |
| **Behaviour** | read-only |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

**IMPORTANT **- STOP here and let the user choose:
1. Show the address list to the user
2. Ask: "Which address would you like to use for delivery?"
3. Do NOT call any other tool until the user has selected an address
4. Remember the selected addressId for all subsequent operations
5. If no addresses are returned, inform the user that they need to add an address first

## Next in this journey →

Continue with [`search_restaurants`](/docs/reference/food/search_restaurants.md).
