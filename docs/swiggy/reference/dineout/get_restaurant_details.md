# get_restaurant_details

> Swiggy Dineout: Get details about a specific restaurant for TABLE BOOKING. Returns ratings, deals, timings, address. Use restaurant ID from search_restaurants_dineout results. Use same coordinates th...

Swiggy Dineout: Get details about a specific restaurant for TABLE BOOKING. Returns ratings, deals, timings, address. Use restaurant ID from search_restaurants_dineout results. Use same coordinates that were used in the search.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_restaurant_details",
  arguments: {
    restaurantId: "rest_42",
    latitude: 12.9716,
    longitude: 77.5946,
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_restaurant_details",
  arguments={
    "restaurantId": "rest_42",
    "latitude": 12.9716,
    "longitude": 77.5946,
  },
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
      "name": "get_restaurant_details",
      "arguments": {
    "restaurantId": "rest_42",
    "latitude": 12.9716,
    "longitude": 77.5946
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `restaurantId` | `string` | **yes** | Restaurant ID from search results |
| `latitude` | `number` | **yes** | Latitude (use same as search) |
| `longitude` | `number` | **yes** | Longitude (use same as search) |

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
| **Name** | `get_restaurant_details` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Find |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`get_available_slots`](/docs/reference/dineout/get_available_slots.md).
