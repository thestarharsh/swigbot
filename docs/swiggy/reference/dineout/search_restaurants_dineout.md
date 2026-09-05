# search_restaurants_dineout

Swiggy Dineout (Reservations): find restaurants to BOOK A TABLE at. Use when the user wants to go out and eat. NOT for food delivery or grocery orders. Returns cuisines, rating, cost for two, distance, highlights, offers and bookable deals.

QUERY - pass the single thing the user is looking for, not their sentence:
- a restaurant or chain name: "Toit", "Social", "Ironhill"
- a cuisine: "Italian", "Biryani", "North Indian"
- an area or landmark: "Indiranagar", "Phoenix Mall of Asia"
- a kind of place: "cafe", "pub", "brewery", "lounge"
- a vibe or amenity: "rooftop", "buffet", "live music", "pet friendly", "outdoor seating"
The search resolves what the term means on its own. Send the term only: "best rooftop places in Koramangala" becomes query="rooftop" with Koramangala coordinates. For a dish, search the cuisine that serves it ("dosa" becomes "South Indian"). Misspellings are tolerated.

LOCATION (required) - one of:
1. "near my home", "near my office", "near me" -&gt; call get_saved_locations first, then pass the chosen addressId.
2. A named city or area -&gt; pass its latitude/longitude. Bangalore 12.9716, 77.5946 | Koramangala 12.9352, 77.6245 | Indiranagar 12.9784, 77.6408 | Mumbai 19.0760, 72.8777 | Delhi 28.6139, 77.2090.
Coordinates must match the place the user asked about. If you do not know them, ask the user rather than guessing a different city.

RESULTS - returns up to `limit` restaurants (default 10). If more matched, the message says so; call again with `offset` to show the next set. An empty result means nothing matched: tell the user and offer a different term. Never present unrelated restaurants as matches.

EXAMPLES:
- "italian place in bangalore" -&gt; query="Italian", lat=12.9716, lng=77.5946
- "somewhere in indiranagar" -&gt; query="Indiranagar", lat=12.9784, lng=77.6408
- "rooftop bar for tonight" -&gt; query="rooftop" with the user's city coordinates
- "is there a Toit near me" -&gt; get_saved_locations first, then query="Toit" with the addressId

After showing results, let the user pick a restaurant. Do NOT automatically call get_restaurant_details or get_available_slots.

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
| `query` | `string` | **yes** | What to search for: a restaurant name, cuisine, area, kind of place (cafe, pub, brewery), or vibe (rooftop, buffet, live music). One term, not a sentence, and no location words when latitude/longitude already cover the location. |
| `entityType` | `"locality" \| "CUISINE" \| "RESTAURANT_CATEGORY" \| "ambience_tags"` | no | Rarely needed. The search already works out whether the query is a cuisine, area, category or vibe. Set this only to force a specific interpretation of an ambiguous term. |
| `addressId` | `string` | no | Address ID from get_saved_locations. Coordinates are resolved automatically. Use this instead of latitude/longitude when searching near a saved address. |
| `latitude` | `number` | no | Latitude for search. Use for direct city/area searches. Not needed if addressId is provided. |
| `longitude` | `number` | no | Longitude for search. Use for direct city/area searches. Not needed if addressId is provided. |
| `limit` | `number` | no | Max restaurants to return. Default 10, max 30. |
| `offset` | `number` | no | Restaurants to skip. Use the offset given in the previous response to show more of the same search. |

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
  restaurants: DineoutRestaurant[];
  latitude: number;
  longitude: number;
  total: number;
  offset: number;
  nextOffset?: number;
}

type DineoutRestaurant = {
  id: string;
  name: string;
  cuisine: string[];
  locality: string;
  area: string;
  rating: { value: string; count: number };
  costForTwo: string;
  imageUrl?: string;
  distance?: string;
  highlights?: string[];
  offers?: Array<{ offerTitle: string; offerDescription?: string }>;
  bankOffers?: Array<{ offerTitle: string }>;
  vendorHighlights?: Array<{ type: string; text: string }>;
  availableDeals?: Array<{ dealTitle: string; ticketId?: number }>;
}
```

This schema documents the structured payload returned by `search_restaurants_dineout`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `nextOffset`: pagination fields. Use them only to fetch or display more results from the same query/list; do not treat offsets as item IDs.
- `latitude` / `longitude`: coordinates from the selected saved location or restaurant context. Reuse returned values for follow-up slot, tracking, or payment calls; do not infer them from address text.
- `ticketId`: Dineout slot/deal fields. Copy identifiers from the exact selected slot/deal; do not derive them from display time or restaurant name.
- `rating` / `costForTwo`: display/ranking signals. Do not use them as stable identifiers for follow-up calls.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `search_restaurants_dineout` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Find |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`get_restaurant_details`](/docs/reference/dineout/get_restaurant_details.md).
