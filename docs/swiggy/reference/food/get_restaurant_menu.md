# get_restaurant_menu

Browse a restaurant's complete menu as a flat, deduplicated list of dishes. Use this when the user wants to explore what a restaurant offers or see more menu options. Each unique dish appears once, with all of its category labels and its bestseller status. Nested categories use `Parent/Sub` labels, and bestseller dishes are also surfaced in the `Recommended` group. Results are capped at 150 unique items and may include `truncated: true` when the cap is reached. The browse view is intentionally compact; to order an item or inspect its full customizations, use `search_menu` with the item name and `restaurantId`.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_restaurant_menu",
  arguments: {
    addressId: "addr_01HXYZ",
    restaurantId: "rest_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_restaurant_menu",
  arguments={
    "addressId": "addr_01HXYZ",
    "restaurantId": "rest_42",
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
      "name": "get_restaurant_menu",
      "arguments": {
    "addressId": "addr_01HXYZ",
    "restaurantId": "rest_42"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `addressId` | `string` | **yes** | Address ID from get_addresses tool |
| `restaurantId` | `string` | **yes** | Restaurant ID to fetch menu for (from search_restaurants) |

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

## Output schema

```ts
data: {
  restaurant: { id: string; name: string; city?: string; areaName?: string; cuisines?: string[]; avgRating?: number; avgRatingString?: string; totalRatingsString?: string; costForTwoMessage?: string; isOpen?: boolean; deliveryTime?: number; slaString?: string; address?: string };
  items: Array<{ id: string; name: string; price?: number; inStock?: number; isVeg?: boolean; isBestseller?: boolean; rating?: string | number; hasVariants?: boolean; hasAddons?: boolean; categories: string[] }>;
  categoryLabels: string[];
  totalItems: number;
  totalCategories: number;
  truncated?: boolean;
}
```

This schema documents the structured payload returned by `get_restaurant_menu`. Optional fields can vary by user state, cart state, and live Swiggy availability.

## Schema notes

- `items`: one entry per unique dish, with every category label associated with that dish. Nested categories use `Parent/Sub` labels, and bestseller dishes are surfaced in the `Recommended` group.
- `categoryLabels`: distinct category labels in menu display order.
- `totalItems` / `totalCategories`: counts for the returned unique items and category labels.
- `truncated`: present and true when the menu exceeds the 150-item browse cap. Use `search_menu` to find or order a specific item beyond the browse result.
- `inStock`: live availability fields. If an item is out of stock, unserviceable, or quantity-capped, show the returned reason/message and refresh before checkout.
- `price`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- `description` / `imageUrl`: intentionally omitted from the compact browse view. Use `search_menu` when ordering to retrieve full item details and customizations.
- `rating` / `avgRating` / `costForTwoMessage` / `avgRatingString` / `totalRatingsString`: display/ranking signals. Do not use them as stable identifiers for follow-up calls.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_restaurant_menu` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Discover |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`update_food_cart`](/docs/reference/food/update_food_cart.md).
