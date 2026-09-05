# get_cart

Swiggy Instamart (Grocery): Get current Swiggy Instamart grocery cart with all items and bill breakdown. Use this for Instamart grocery orders, NOT for Food delivery. Authentication is handled automatically.

Payment guidance: call get_payment_options when the user is ready to pay. Use only payment methods returned by the tool or cart response.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_cart",
  arguments: {},
});
```

**Python**
```py
result = await session.call_tool(
  "get_cart",
  arguments={},
)
```

**curl**
```bash
curl -X POST https://mcp.swiggy.com/im \
  -H "Authorization: Bearer $SWIGGY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_cart",
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
data: InstamartCart & {
  availablePaymentMethods?: string[];
  paymentOptions?: PaymentOptionsView | null;
}

type InstamartCart = {
  selectedAddress?: string;
  selectedAddressDetails?: {
    id: string;
    address: string;
    area: string;
    name: string;
    mobile: string;
    annotation?: string;
    category?: string;
    flatNo?: string;
    city?: string;
  };
  cartTotalAmount: string;
  items: InstamartCartItem[];
  billBreakdown: {
    lineItems: Array<{ label: string; value: string }>;
    toPay: { label: string; value: string };
  };
  cartId?: string;
  addressWarning?: string;
  unserviceableItems?: InstamartCartItem[];
  cartAbsent?: boolean;
  cartAbsentReason?: string;
  cartWarning?: { statusCode: number; message: string };
}

type InstamartCartItem = {
  spinId: string;
  skuId: string;
  productId: string;
  itemName: string;
  itemVariant?: string;
  quantity: number;
  isInStockAndAvailable: boolean;
  mrp: number;
  discountedFinalPrice: number;
  imageUrl?: string;
  maxQuantity?: number;
  maxQuantityMessage?: string;
}
```

This schema documents the structured payload returned by `get_cart`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `spinId` / `skuId` / `productId`: Instamart product/SKU identifiers. Use returned SKU-level IDs from the selected product variation when updating an Instamart cart; product-level IDs identify the broader product family.
- `cartId`: server-side cart reference for the current authenticated session. Use it only for the immediate follow-up flow; refresh the cart if the user changes items, address, slot, or payment path.
- `cartTotalAmount`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `statusCode`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `paymentOptions` / `availablePaymentMethods`: live payment choices or selected payment fields for this cart/order. Offer only returned methods and pass selected payment IDs exactly.
- `isInStockAndAvailable` / `unserviceableItems`: live availability fields. If an item is out of stock, unserviceable, or quantity-capped, show the returned reason/message and refresh before checkout.
- `mrp` / `discountedFinalPrice`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_cart` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Cart |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`checkout`](/docs/reference/instamart/checkout.md).
