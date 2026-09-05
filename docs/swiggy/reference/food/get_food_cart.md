# get_food_cart

Get current food delivery cart with all items. PRIMARY FOOD DELIVERY SERVICE - Use this to view cart contents when ordering food for delivery. Swiggy Food delivery. Response includes valid_addons field for each item which shows which addons are valid based on the selected variants. Use this to determine which addons can be added. NOT for groceries or restaurant reservations.

Payment guidance: call get_payment_options when the user is ready to pay. Use only payment methods returned by the tool or cart response.

COUPON NOTE: The response may include offers.coupon_applied with coupon_discount=0 — this means the coupon is auto-suggested (best available) but NOT actually applied. Do NOT tell the user a coupon is "applied" or show savings unless coupon_discount &gt; 0.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_food_cart",
  arguments: {
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_food_cart",
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
      "name": "get_food_cart",
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
| `addressId` | `string` | **yes** | Address ID to get accurate delivery charges based on location. |
| `restaurantName` | `string` | no | Restaurant name from search_restaurants or search_menu results. Pass this so the cart view can display the restaurant name (the cart API does not always return it). |

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
  data?: {
    cart_id?: string;
    result?: string;
    restaurant?: FoodCartRestaurant | null;
    items?: FoodCartItem[];
    item_count?: number;
    pricing?: FoodCartPricing;
    offers?: FoodCartOffers;
  };
  addressId: string;
  availablePaymentMethods?: string[];
  paymentOptions?: PaymentOptionsView | null;
  gpoError?: string;
}

type FoodCartRestaurant = {
  id?: string;
  name?: string;
  area?: string;
  deliverySubtitle?: string;
}

type FoodCartItem = {
  menu_item_id: string;
  name: string;
  imageUrl?: string;
  quantity: number;
  is_veg?: boolean | string | number;
  subtotal: number;
  total: number;
  final_price: number;
  in_stock?: boolean;
  variants?: FoodCartSelection[];
  addons?: FoodCartAddon[];
  valid_addons?: FoodCartAddonGroup[];
}

type FoodCartSelection = {
  id?: string;
  name?: string;
  group_id?: string;
  groupId?: string;
  variation_id?: string;
  variationId?: string;
  price?: number;
}

type FoodCartAddon = FoodCartSelection & {
  quantity?: number;
}

type FoodCartAddonGroup = {
  group_id?: string;
  groupId?: string;
  name?: string;
  minAddons?: number;
  maxAddons?: number;
  choices?: FoodCartAddon[];
  addons?: FoodCartAddon[];
}

type FoodCartPricing = {
  item_total: number;
  delivery_charge: number;
  delivery_charge_strikeoff?: number;
  taxes_and_charges: number;
  to_pay: number;
}

type FoodCartOffers = {
  coupon_applied?: string | null;
  coupon_discount?: number;
  free_delivery_applied?: boolean;
}

type PaymentOptionsView = {
  allMethods: PaymentMethod[];
  upiMethods?: PaymentMethod[];
  allGroups?: Array<{ group_name?: string; display_name?: string; methods?: PaymentMethod[] }>;
  paymentAmount?: string | null;
  markdown?: string;
}

type PaymentMethod = {
  id: string;
  groupName?: string;
  displayName?: string;
  kind?: "intent" | "qr";
  iconUrl?: string;
  enabled?: boolean;
}
```

Food cart data is the trimmed live cart payload from the Food cart API. The response includes `addressId` for payment and order placement.

### Schema notes

- `addressId`: stable identifier for a saved Swiggy delivery address. Use the returned ID in cart, checkout, and payment calls instead of reusing the human-readable address text.
- `menu_item_id`: Food menu item identifier used by `update_food_cart`. It is different from display name and must be copied exactly from menu/search/cart responses.
- `variation_id` / `variationId`: selected Food item variant option, such as size, preparation, or portion. Send it back with its matching customization group ID when adding or updating a customized Food item.
- `group_id` / `groupId`: customization group that a variant or addon belongs to. Keep the group and choice IDs paired exactly as returned; mixing groups can make cart updates fail or select the wrong customization.
- `valid_addons`: addon groups allowed for the item after its current variant selection. Prefer this over the broader menu addon list before offering add-ons to the user.
- `minAddons` / `maxAddons`: addon selection constraints for that group. Positive maximum values limit how many choices can be selected; minimum values mean the user must pick at least that many.
- `cart_id`: server-side cart reference for the current authenticated session. Use it only for the immediate follow-up flow; refresh the cart if the user changes items, address, slot, or payment path.
- `item_total` / `to_pay`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `delivery_charge` / `taxes_and_charges`: component charge fields. Use the final payable total for checkout decisions rather than summing components yourself.
- `coupon_applied` / `coupon_discount`: coupon visibility/application fields. Treat a coupon as applied only when the returned cart shows an applied coupon/code and a positive discount where available.
- `paymentOptions` / `availablePaymentMethods` / `allMethods`: live payment choices or selected payment fields for this cart/order. Offer only returned methods and pass selected payment IDs exactly.
- `price` / `final_price` / `subtotal`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_food_cart` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Cart |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`apply_food_coupon`](/docs/reference/food/apply_food_coupon.md).
