# get_food_order_details

Get detailed information about a specific food delivery order. PRIMARY FOOD DELIVERY SERVICE - Use this when user asks about order details, order information, or wants to see what they ordered. Swiggy Food delivery. Returns comprehensive order details including items, variants, pricing breakdown, delivery address, payment info, and order status.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_food_order_details",
  arguments: {
    orderId: "ord_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_food_order_details",
  arguments={
    "orderId": "ord_42",
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
      "name": "get_food_order_details",
      "arguments": {
    "orderId": "ord_42"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `orderId` | `string` | **yes** | Order ID to fetch details for (can be obtained from get_food_orders) |

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
  order: {
    order_id: number;
    delivery_address: DeliveryAddress;
    order_items: OrderItem[];
    charges: Record<string, string>;
    is_coupon_applied: boolean;
    coupon_applied?: string;
    order_time: string;
    confirmed_time: string;
    customer_id: string;
    order_status: string;
    post_status: string;
    order_type: string;
    restaurant_id: string;
    restaurant_name: string;
    restaurant_address: string;
    restaurant_locality: string;
    restaurant_area_name?: string;
    restaurant_cuisine: string[];
    payment_method: string;
    order_total: number;
    item_total: number;
    order_tax: number;
    order_discount: number;
    coupon_discount: number;
    order_delivery_charge: number;
    is_cancellable: boolean;
    is_reorderable_order: boolean;
  };
  statusMessage?: string;
}

type DeliveryAddress = {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string;
  address: string;
  landmark?: string;
  area: string;
  mobile: string;
  flat_no?: string;
  city: string;
  lat: string;
  lng: string;
}

type OrderItem = {
  item_id: string;
  external_item_id?: string;
  name: string;
  is_veg: string;
  variants?: FoodOrderItemVariant[];
  addons?: FoodOrderItemAddon[];
  image_id?: string;
  quantity: string;
  total: string;
  subtotal: string;
  final_price: string;
  base_price: string;
  packing_charges: string;
  category_details?: {
    category: string;
    sub_category: string;
  };
  item_charges?: Record<string, string>;
  attributes?: {
    portionSize?: string;
    spiceLevel?: string | null;
    vegClassifier?: string;
    accompaniments?: string | null;
  };
}

type FoodOrderItemVariant = {
  variation_id: number;
  group_id: number;
  name: string;
  price: number;
  external_choice_id?: string;
  external_group_id?: string;
  variant_tax_charges?: Record<string, string>;
}

type FoodOrderItemAddon = {
  addon_id: number;
  group_id: number;
  name: string;
  price: number;
}
```

This schema documents the structured payload returned by `get_food_order_details`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `restaurant_id`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `variation_id`: selected Food item variant option, such as size, preparation, or portion. Send it back with its matching customization group ID when adding or updating a customized Food item.
- `group_id`: customization group that a variant or addon belongs to. Keep the group and choice IDs paired exactly as returned; mixing groups can make cart updates fail or select the wrong customization.
- `item_total` / `order_total`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `order_tax`: component charge fields. Use the final payable total for checkout decisions rather than summing components yourself.
- `coupon_applied` / `coupon_discount`: coupon visibility/application fields. Treat a coupon as applied only when the returned cart shows an applied coupon/code and a positive discount where available.
- `statusMessage` / `post_status`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `order_id`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `lat` / `lng`: coordinates from the selected saved location or restaurant context. Reuse returned values for follow-up slot, tracking, or payment calls; do not infer them from address text.
- `is_cancellable`: cancellation fields. Ask for user confirmation before calling a cancellation tool.
- `price` / `final_price` / `subtotal`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_food_order_details` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Track |
| **Behaviour** | read-only |
