# search_restaurants_dineout

> Swiggy Dineout: Search restaurants for TABLE BOOKING/RESERVATIONS. Use when user wants to GO OUT and book a table. NOT for food delivery. Returns rich results: cuisines, ratings with count, costForTw...

Swiggy Dineout: Search restaurants for TABLE BOOKING/RESERVATIONS. Use when user wants to GO OUT and book a table. NOT for food delivery. Returns rich results: cuisines, ratings with count, costForTwo, distance, highlights (valet parking, live music, etc.), offers, bank offers, and available deals.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "search_restaurants_dineout",
  arguments: {
    query: "biryani",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "search_restaurants_dineout",
  arguments={
    "query": "biryani",
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
      "name": "search_restaurants_dineout",
      "arguments": {
    "query": "biryani"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | `string` | **yes** | Search query - restaurant name, cuisine type (Italian, Chinese, Indian), locality/area (Koramangala, Indiranagar), or descriptive terms (romantic, rooftop). Do NOT include location/city in query. |
| `entityType` | `undefined` | no | Search filter type. "locality" for area search (Indiranagar, Koramangala). "CUISINE" for cuisine search (Italian, Chinese, Biryani). "RESTAURANT_CATEGORY" for category search (cafe, pub, bar, brewery, lounge, buffet). Omit for restaurant name searches. |
| `addressId` | `string` | no | Address ID from get_saved_locations. Coordinates are resolved server-side. Use this instead of latitude/longitude when searching near a saved address. |
| `latitude` | `number` | no | Latitude for search. Use for direct city/area searches. Not needed if addressId is provided. |
| `longitude` | `number` | no | Longitude for search. Use for direct city/area searches. Not needed if addressId is provided. |

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
| **Name** | `search_restaurants_dineout` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Find |
| **Behaviour** | read-only |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

**LOCATION **- Provide location using ONE of these methods: 
1. SAVED ADDRESS: If user says "near my home", "near my office", "my location" → First call get_saved_locations, then pass the chosen addressId here. 
2. CITY/AREA NAME: If user mentions a place (Bangalore, Koramangala, Mumbai, Indiranagar), use latitude/longitude for that location. Common coordinates: 
   - Bangalore center: 12.9716, 77.5946 
   - Koramangala: 12.9352, 77.6245 
   - Indiranagar: 12.9784, 77.6408 
   - Mumbai center: 19.0760, 72.8777 
   - Delhi center: 28.6139, 77.2090

ENTITY TYPE (IMPORTANT): Set entityType to filter search results correctly:
- Locality/area search (Indiranagar, Koramangala, JP Nagar) → entityType="locality"
- Cuisine search (Chinese, Italian, Biryani) → entityType="CUISINE"
- Category search (cafe, pub, bar, brewery, lounge, buffet) → entityType="RESTAURANT_CATEGORY"
- Restaurant name search (Social, Ironhill, Zaika) → omit entityType

> **Warning**
>
> Without entityType, locality and cuisine queries return generic nearby results instead of filtered results.

SEARCH BEHAVIOR:
- With entityType: Returns rich data (cuisines, ratings, costForTwo, highlights, offers)
- Without entityType: Returns exact name matches but limited data. Call get_restaurant_details for full info on results with source="autosuggest".

**QUERY**: Restaurant name, cuisine type, locality/area name, category, or descriptive terms. Do NOT include location/city in query if already provided via lat/lng.

EXAMPLES: 
- "Italian in Bangalore" → query="Italian", entityType="CUISINE", lat=12.9716, lng=77.5946 
- "restaurants in Indiranagar" → query="Indiranagar", entityType="locality", lat=12.9784, lng=77.6408 
- "cafes in Koramangala" → query="cafe", entityType="RESTAURANT_CATEGORY", lat=12.9352, lng=77.6245 
- "pubs in Bangalore" → query="pub", entityType="RESTAURANT_CATEGORY", lat=12.9716, lng=77.5946 
- "Social" → query="Social", no entityType, lat=12.9352, lng=77.6245 
- "near my home" → First call get_saved_locations, then pass addressId here

## Next in this journey →

Continue with [`get_restaurant_details`](/docs/reference/dineout/get_restaurant_details.md).
