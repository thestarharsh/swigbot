# delete_address

> Swiggy (Instamart/Food): Delete a saved delivery address for the authenticated user.

Swiggy (Instamart/Food): Delete a saved delivery address for the authenticated user.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "delete_address",
  arguments: {
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "delete_address",
  arguments={
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
      "name": "delete_address",
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
| `addressId` | `string` | **yes** | The ID of the address to delete (from get_addresses response) |

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
  statusCode: number;
  statusMessage: string;
}
```

## Details

| Field | Value |
| --- | --- |
| **Name** | `delete_address` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Discover |
| **Behaviour** | mutating |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

📍 WORKFLOW:
1. First call get_addresses to show the user their saved addresses
2. Ask the user which address they want to delete
3. Get the addressId from the user's selection
4. Call this tool with the addressId

⚠️ WARNING: This action is permanent and cannot be undone. Always confirm with the user before deleting.

## Next in this journey →

Continue with [`get_addresses`](/docs/reference/food/get_addresses.md).
