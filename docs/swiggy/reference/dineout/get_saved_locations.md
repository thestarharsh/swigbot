# get_saved_locations

Swiggy Dineout (Reservations): Get user's saved addresses for restaurant search. NOT for food delivery or grocery orders. Returns address IDs that can be passed to search_restaurants_dineout.

WHEN TO USE THIS TOOL: 
- User says "near my home" 
- User says "near my office" 
- User says "my location" or "my address" 
- User says "where I live" or "my place" 

 DO NOT USE when user mentions a specific city/area (Bangalore, Koramangala, Mumbai) - use coordinates directly in search_restaurants_dineout instead. 

 WORKFLOW: 
1. Call this tool to get saved locations 
2. Show locations to user as numbered list 
3. Ask: "Which location would you like to search near?" 
4. Pass the chosen location's id as addressId in search_restaurants_dineout 

RETURNS: List with index (1, 2, 3...), id, and addressLine for each saved address.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_saved_locations",
  arguments: {},
});
```

**Python**
```py
result = await session.call_tool(
  "get_saved_locations",
  arguments={},
)
```

**curl**
```bash
curl -X POST https://mcp.swiggy.com/dineout \
  -H "Authorization: Bearer $SWIGGY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_saved_locations",
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

### Output schema

```ts
data: {
  locations: Array<{
    index: number;
    id: string;
    addressLine: string;
    phoneNumber: string;
    addressCategory?: string;
    addressTag?: string;
  }>;
}
```

This schema documents the structured payload returned by `get_saved_locations`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `id`: stable identifier for a saved Swiggy location. Use the returned ID/coordinates in Dineout follow-up calls instead of deriving location from address text.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_saved_locations` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Find |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`search_restaurants_dineout`](/docs/reference/dineout/search_restaurants_dineout.md).
