# create_cart

Swiggy Dineout (Reservations): Create a booking cart. NOT for food delivery or grocery orders. Use this for PAID prebook deals (isFree=false): call with cartType="DEAL_TICKET_PURCHASE" + slot details + guest count. It returns the cartKey and shows a Booking Summary card. STOP after this — wait for the user to tap "Proceed to payment" before showing any payment methods. After they pick a method, call book_table with paymentMethod="UPI", the chosen intentApp, and that cartKey. For FREE deals, skip this — call book_table directly (it creates + confirms the free cart in one step).

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "create_cart",
  arguments: {
    restaurantId: "rest_42",
    cartType: "DEAL_TICKET_PURCHASE",
    latitude: 12.9716,
    longitude: 77.5946,
    slotId: 4242,
    itemId: "rest_42-ticket_7",
    reservationTime: 1735675200,
    guestCount: 2,
  },
});
```

**Python**
```py
result = await session.call_tool(
  "create_cart",
  arguments={
    "restaurantId": "rest_42",
    "cartType": "DEAL_TICKET_PURCHASE",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "slotId": 4242,
    "itemId": "rest_42-ticket_7",
    "reservationTime": 1735675200,
    "guestCount": 2,
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
      "name": "create_cart",
      "arguments": {
    "restaurantId": "rest_42",
    "cartType": "DEAL_TICKET_PURCHASE",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "slotId": 4242,
    "itemId": "rest_42-ticket_7",
    "reservationTime": 1735675200,
    "guestCount": 2
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `restaurantId` | `string` | **yes** | Restaurant ID |
| `cartType` | `"DEAL_TICKET_PURCHASE" \| "DINEOUT"` | **yes** | Cart type: DEAL_TICKET_PURCHASE for booking, DINEOUT for bill payment |
| `latitude` | `number` | **yes** | Latitude |
| `longitude` | `number` | **yes** | Longitude |
| `slotId` | `number` | **yes for DEAL_TICKET_PURCHASE** | Slot ID (required for booking cart) |
| `itemId` | `string` | **yes for DEAL_TICKET_PURCHASE** | Item ID (required for booking cart, format: "restaurantId-ticketId") |
| `reservationTime` | `number` | **yes for DEAL_TICKET_PURCHASE** | Unix timestamp (required for booking cart) |
| `guestCount` | `number` | **yes for DEAL_TICKET_PURCHASE** | Number of guests (required for booking cart, 1-20) |
| `billAmount` | `number` | **yes for DINEOUT** | Bill amount in rupees (required for bill payment cart) |
| `source` | `string` | no | Source for bill payment cart (default: "direct-payment-cart") |

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
  cart: {
    cartId?: string;
    cartKey: string;
    cartType?: "DEAL_TICKET_PURCHASE" | "DINEOUT";
    restaurantId?: string;
    bill?: {
      billToPay?: number;
      skipPayment?: boolean;
      dineoutPricingInfo?: { billToPay?: number };
    };
  };
  cartKey: string;
  availablePaymentMethods: string[];
  paymentOptions: PaymentOptionsView | null;
  gpoError?: string;
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

This schema documents the structured payload returned by `create_cart`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `restaurantId`: Swiggy restaurant identifier. Preserve it exactly for menu, cart, slot, booking, and order follow-up calls.
- `cartId` / `cartKey`: server-side cart reference for the current authenticated session. Use it only for the immediate follow-up flow; refresh the cart if the user changes items, address, slot, or payment path.
- `billToPay`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `paymentOptions` / `availablePaymentMethods` / `allMethods`: live payment choices or selected payment fields for this cart/order. Offer only returned methods and pass selected payment IDs exactly.
- `skipPayment`: Dineout payment/price indicators. Paid deals must go through the payment flow; free deals can be booked directly after confirmation.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `create_cart` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Reserve |
| **Behaviour** | mutating |

## Next in this journey →

Continue with [`book_table`](/docs/reference/dineout/book_table.md).
