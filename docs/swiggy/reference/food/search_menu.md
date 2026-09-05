# search_menu

Search for dishes and menu items to order for food delivery. PRIMARY FOOD DELIVERY SERVICE - Use this when user wants to find specific dishes, browse menu items, see what a restaurant offers, or order food. Swiggy Food delivery. Returns items with their customizations. The text response includes variant/addon IDs that you need for update_food_cart calls. IMPORTANT: Each item has EITHER "variations" (single-variant format) OR "variantsV2" (new format), never both - check which field exists and use the corresponding field when adding to cart. The addons shown are ALL possible addons for the item, but some addons are only valid for specific variant selections. When adding items to cart with customizations: (1) Add item with variants first using the SAME format (variations or variantsV2) as returned, (2) Check cart response for valid_addons to see which addons are actually available for your variant selection, (3) Then add addons from valid_addons list. Optionally scope with restaurantIdOfAddedItem. NOT for groceries or restaurant reservations.

⚠️ REQUIRED WORKFLOW: You MUST call get_addresses first to obtain a valid addressId, then pass that addressId to this tool. NEVER guess, invent, or use placeholder values. The addressId must come from get_addresses response.

CROSS-RESTAURANT SEARCH: When user asks for a dish, first search within the current restaurant (using restaurantIdOfAddedItem if items are in cart). If no results or poor matches, search again WITHOUT restaurantIdOfAddedItem to find the dish at other restaurants. Inform the user: "I couldn't find that at [restaurant]. Here are options from other restaurants."

DRILL INTO A DISH: A search WITHOUT restaurantIdOfAddedItem returns dishes across many restaurants (each line shows its "restaurantId: &lt;id&gt;"). When the user picks/opens a specific dish from those results, call search_menu again with restaurantIdOfAddedItem set to THAT dish's restaurantId — this returns the dish scoped to its restaurant with full variant/add-on details so it can be added to the cart.

ADDONS & CUSTOMIZATIONS: When user asks about addons or customizations for an item, use the addons data already returned in this search_menu response — do NOT call search_menu again. Present the available addon choices (name + price) in text. If the item has hasAddons=true, the addons array contains all options.

MORE OPTIONS: search_menu returns paginated results. Use nextOffset from the response to load more items for the same query. For different dishes, call search_menu with a DIFFERENT query or use get_restaurant_menu to browse categories.

After showing results, let the user review the items and confirm what to add. Do NOT automatically call update_food_cart — wait for the user to decide.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "search_menu",
  arguments: {
    addressId: "addr_01HXYZ",
    query: "biryani",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "search_menu",
  arguments={
    "addressId": "addr_01HXYZ",
    "query": "biryani",
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
      "name": "search_menu",
      "arguments": {
    "addressId": "addr_01HXYZ",
    "query": "biryani"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `addressId` | `string` | **yes** | REQUIRED: Address ID obtained from get_addresses tool. You MUST call get_addresses first to get this value. Do NOT invent or guess addressId values. |
| `query` | `string` | **yes** | REQUIRED: Search query (dish name). Cannot be empty. Examples: "biryani", "pizza margherita", "paneer tikka" |
| `restaurantIdOfAddedItem` | `string` | no | Optional restaurant ID to scope search |
| `vegFilter` | `0 \| 1` | no | Veg filter flag (0 or 1). Pass 1 for veg-only items. 0 or omitted returns mixed veg + non-veg. There is NO non-veg-only filter — if user asks for "non-veg only", pass 0 (mixed) and mention in text that you are showing all items including non-veg, since a non-veg-only filter is not available yet. |
| `offset` | `number` | no | Pagination offset. Use nextOffset from previous response to load more results. Default: 0. |

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
  items: MenuItemSummary[];
  query: string;
  restaurantIdOfAddedItem?: string;
  totalItems: number;
  hasMore: boolean;
  nextOffset?: number;
}

type MenuItemSummary = {
  name: string;
  price?: number;
  isVeg?: boolean;
  menu_item_id?: string;
  inStock?: number;
  restaurant_id?: string;
  restaurant_name?: string;
  imageUrl?: string;
  rating?: string | number;
  totalRatings?: string;
  hasVariants?: boolean;
  hasAddons?: boolean;
  isBestseller?: boolean;
  variations?: Array<{ name?: string; price?: number; isVeg?: boolean; id?: string; groupId?: string; default?: number; inStock?: number }>;
  variantsV2?: Array<{ groupId: string; name: string; variations: Array<{ id: string; name: string; price?: number; inStock?: number; default?: number }> }>;
  addons?: Array<{ groupId: string; groupName: string; minAddons?: number; maxAddons?: number; maxFreeAddons?: number; choices: Array<{ id: string; name: string; price: number }> }>;
}
```

This schema documents the structured payload returned by `search_menu`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `restaurant_id` / `restaurantIdOfAddedItem`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `menu_item_id`: Food menu item identifier used by `update_food_cart`. It is different from display name and must be copied exactly from menu/search/cart responses.
- `variations` and `variantsV2`: Food customization formats. Use the same format returned for the item when building cart updates; do not mix legacy `variations` with `variantsV2` for the same item.
- `groupId`: customization group that a variant or addon belongs to. Keep the group and choice IDs paired exactly as returned; mixing groups can make cart updates fail or select the wrong customization.
- `minAddons` / `maxAddons` / `maxFreeAddons`: addon selection constraints for that group. Positive maximum values limit how many choices can be selected; minimum values mean the user must pick at least that many.
- `nextOffset` / `hasMore`: pagination fields. Use them only to fetch or display more results from the same query/list; do not treat offsets as item IDs.
- `inStock`: live availability fields. If an item is out of stock, unserviceable, or quantity-capped, show the returned reason/message and refresh before checkout.
- `price`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- `rating` / `totalRatings`: display/ranking signals. Do not use them as stable identifiers for follow-up calls.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `search_menu` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Discover |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`get_restaurant_menu`](/docs/reference/food/get_restaurant_menu.md).
