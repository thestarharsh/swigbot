# get_orders

Swiggy Instamart order history - Use this to fetch ORDER HISTORY, past orders, or order preferences. Use this FIRST when user asks: "show my orders", "get my orders", "my last order", "order history", "past orders", "recent orders", "list my orders", "what did I order before", "my previous orders", "check my past orders", "my order preferences", "get preferences from past orders", "what do I usually order", "my frequent items", "reorder", "order again", "buy the same thing", "what groceries did I buy", "my purchase history", "items I bought before". Returns a list of orders from the last 15 days with basic details including items, status, and delivery address coordinates. Set activeOnly=true when user asks for active/current/ongoing orders: "active orders", "current orders", "ongoing orders", "pending orders", "in-progress orders", "orders on the way", "orders being delivered", "my current deliveries". For REAL-TIME TRACKING of a specific order (where is my order, track my order, ETA, delivery partner location), use the track_order tool instead - it requires orderId and coordinates which can be obtained from this tool. Authentication is handled automatically. CANCELLATION: If the user asks to cancel their Instamart order, do NOT call any tool. Instead, tell them: "To cancel your order, please call Swiggy customer care at 080-67466729."

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_orders",
  arguments: {
    count: 0,
    orderType: "...",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_orders",
  arguments={
    "count": 0,
    "orderType": "...",
  },
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
      "name": "get_orders",
      "arguments": {
    "count": 0,
    "orderType": "..."
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `count` | `number` | no | Number of orders to fetch (default: 10, max recommended: 20) |
| `orderType` | `string` | no | Order type filter (e.g., "DASH", "INSTAMART"). Default: "DASH" |
| `activeOnly` | `boolean` | no | Set to true to filter only active/ongoing orders. Default: false (returns all orders) |

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
    status: string;
    createdAt: string;
    updatedAt: string;
    estimatedDeliveryTime?: string;
    itemCount: number;
    totalAmount: number;
    deliveryAddress?: { id: string; addressLine: string; phoneNumber: string };
    paymentMethod?: string;
    orderType: string;
    isActive: boolean;
    currentStatus: string;
    statusMessage?: string;
    historyStatus: string;
    storeName?: string;
    items: Array<{ name: string; quantity: number; itemId?: string }>;
    billDetails?: { itemTotal: number; deliveryFee: number; packagingFee: number; grandTotal: number };
    paymentStatus?: string;
    refundStatus?: string;
  }>;
  hasMore: boolean;
}
```

This schema documents the structured payload returned by `get_orders`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `id`: stable identifier for a saved Swiggy delivery address. Use the returned ID in cart, checkout, and payment calls instead of reusing the human-readable address text.
- `hasMore`: pagination fields. Use them only to fetch or display more results from the same query/list; do not treat page numbers as item IDs.
- `totalAmount` / `grandTotal`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `deliveryFee` / `packagingFee`: component charge fields. Use the final payable total for checkout decisions rather than summing components yourself.
- `status` / `statusMessage` / `currentStatus` / `historyStatus`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `paymentMethod`: payment-flow fields for UPI/Cash flows. Payment IDs are used for polling/confirmation; `isQrFlow=true` means the user is expected to complete payment through a scan-QR path.
- `estimatedDeliveryTime`: ETA/tracking fields. Use formatted ETA text when present; timestamp fields can be used to compute countdowns.
- `itemId`: Dineout slot/deal fields. Copy identifiers from the exact selected slot/deal; do not derive them from display time or restaurant name.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_orders` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Track |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`get_order_details`](/docs/reference/instamart/get_order_details.md).
