# get_restaurant_details

Swiggy Dineout (Reservations): Get details about a specific restaurant for TABLE BOOKING. NOT for food delivery or grocery orders. Returns ratings, deals and offers, opening/closing timings, address, menu images, and amenities (valet parking, live music, outdoor seating, etc.). Use this to show the user detailed information about a restaurant so they can decide whether to book a table. IMPORTANT: When the user selects a restaurant from search results or says "show details for [name]", call this tool directly with the restaurantId from the previous search_restaurants_dineout response. Do NOT call search_restaurants_dineout again. Use same coordinates that were used in the search. After showing details, ask if the user wants to check availability or book a table. Do NOT automatically call get_available_slots — wait for the user to decide.

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

### Output schema

```ts
data: {
  statusCode: number;
  statusMessage: string;
  data: {
    restaurantId: string;
    restaurant: {
      id: string;
      restaurantId: string;
      name: string;
      cuisines: string[];
      locality: string;
      area: string;
      address: string;
      avgRating: number;
      totalRatings?: string;
      costForTwo: string;
      distance?: string;
      imageUrl?: string;
      mastheadImageUrls?: string[];
      description?: string;
      timings: string;
      deals: DineoutRestaurantDeal[];
      partnerType?: "PR" | "NPR";
    };
    menuImages: DineoutMenuImage[];
    menuImageGroups: Array<{
      title: string;
      images: DineoutMenuImage[];
    }>;
    amenities: string[];
    locationMapUrl?: string;
  };
}

type DineoutRestaurantDeal = {
  id: string | number;
  title: string;
  description: string;
  discountPercentage: number;
  coverCharge: number;
  slotGroupName: string;
  offerCategory?: "prebooking" | "walkin";
  adjoiningSubtext?: string;
  secondarySubtext?: string;
  offerLogo?: string;
}

type DineoutMenuImage = {
  imageUrl: string;
  label?: string;
}
```

The tool also includes `latitude` and `longitude` as top-level tool-result fields outside `data` for follow-up actions.

### Schema notes

- `restaurantId`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `statusCode` / `statusMessage`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `coverCharge`: Dineout payment/price indicators. Paid deals must go through the payment flow; free deals can be booked directly after confirmation.
- `avgRating` / `totalRatings` / `costForTwo`: display/ranking signals. Do not use them as stable identifiers for follow-up calls.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

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
