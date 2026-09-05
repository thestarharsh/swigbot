# get_food_orders

Swiggy Food order history - Use this to fetch ORDER HISTORY, past orders, or active orders. PRIMARY FOOD DELIVERY SERVICE - Use this FIRST when user asks: "show my food orders", "my food order history", "past food orders", "recent food orders", "what did I order", "my previous food orders", "list my food orders". Returns the user's most recent food orders (both active and delivered) ordered newest-first. Only set activeOnly=true when the user explicitly asks for ONLY current/active/in-progress/ongoing orders (e.g. "my active food orders", "current food orders", "orders on the way", "orders being delivered", "ongoing orders right now"); for any other generic "show my orders" intent, leave activeOnly unset / false. Uses addressId instead of lat/lng for privacy - coordinates are fetched internally. For REAL-TIME TRACKING of an in-progress order (where is my food, ETA), use the track_food_order tool. CANCELLATION: If the user asks to cancel their food order, do NOT call any tool. Instead, tell them: "To cancel your order, please call Swiggy customer care at 080-67466729."

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_food_orders",
  arguments: {
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_food_orders",
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
      "name": "get_food_orders",
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
| `addressId` | `string` | **yes** | Address ID to use for fetching orders (can be obtained from get_addresses) |
| `activeOnly` | `boolean` | no | Set to true to filter only active/in-progress orders. Default: false. |

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
  orders: Array<{
    orderId: string;
    restaurantId: string;
    restaurantName: string;
    restaurantAreaName?: string;
    orderTotal: string;
    orderStatus: string;
    orderDeliveryStatus?: string;
    orderType: string;
    orderedItems: string;
    orderedTime: string;
    isActiveOrder: boolean;
    actions: OrderAction[];
  }>;
  statusMessage?: string;
}

type OrderAction = {
  type: string;
  priority: number;
  title: string;
  isEnabled: boolean;
  reorderMeta?: {
    orderItems: FoodReorderItem[];
    restaurantCoverImageId?: string;
  };
  rateDeliveryMeta?: {
    ratingType: string;
    rateAll: boolean;
    ratingTitle: string;
  };
}

type FoodReorderItem = {
  menu_item_id?: string;
  item_id?: string;
  name?: string;
  quantity?: number | string;
  variants?: Array<{
    variation_id?: number | string;
    group_id?: number | string;
    name?: string;
    price?: number;
  }>;
  addons?: Array<{
    addon_id?: number | string;
    group_id?: number | string;
    name?: string;
    price?: number;
  }>;
}
```

This schema documents the structured payload returned by `get_food_orders`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `restaurantId`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `menu_item_id`: Food menu item identifier used by `update_food_cart`. It is different from display name and must be copied exactly from menu/search/cart responses.
- `variation_id`: selected Food item variant option, such as size, preparation, or portion. Send it back with its matching customization group ID when adding or updating a customized Food item.
- `group_id`: customization group that a variant or addon belongs to. Keep the group and choice IDs paired exactly as returned; mixing groups can make cart updates fail or select the wrong customization.
- `orderTotal`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `statusMessage` / `orderStatus` / `orderDeliveryStatus`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `price`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_food_orders` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Track |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`get_food_order_details`](/docs/reference/food/get_food_order_details.md).
