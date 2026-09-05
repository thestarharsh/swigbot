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
curl -X POST https://mcp.swiggy.com/im \
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

Success:

```json
{
  "success": true,
  "message": "Address deleted successfully"
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

This schema documents the structured payload returned by `delete_address`. Prefer the accompanying status message when confirming the result of this irreversible action.

> **Generally available:** As of Aug 2026, `delete_address` is available to every authenticated Swiggy user — no whitelist or feature flag.

## Details

| Field | Value |
| --- | --- |
| **Name** | `delete_address` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Discover |
| **Behaviour** | mutating |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

WORKFLOW:
1. First call get_addresses to show the user their saved addresses
2. Ask the user which address they want to delete
3. Get the addressId from the user's selection
4. Call this tool with the addressId

> **Warning**
>
> WARNING: This action is permanent and cannot be undone. Always confirm with the user before deleting.

## Next in this journey →

Continue with [`get_addresses`](/docs/reference/instamart/get_addresses.md).
