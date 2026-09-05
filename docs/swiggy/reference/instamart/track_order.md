# track_order

Track Swiggy Instamart order status in real-time. PRIMARY TOOL for order tracking - Use this FIRST when user asks: "where is my order", "track my order", "order status", "what's the status of my order", "when will my order arrive", "ETA for my order", "is my order on the way", "has my order been delivered", "track order", "check order status", or any query about a specific order's current status. Returns real-time tracking info including: current status, ETA, delivery partner location, store info, delivery address, items ordered, and payment details. Requires orderId and delivery address coordinates. If user doesn't provide orderId, first use get_orders to find the order, then use this tool to track it.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "track_order",
  arguments: {
    orderId: "ord_42",
    lat: 12.9716,
    lng: 77.5946,
  },
});
```

**Python**
```py
result = await session.call_tool(
  "track_order",
  arguments={
    "orderId": "ord_42",
    "lat": 12.9716,
    "lng": 77.5946,
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
      "name": "track_order",
      "arguments": {
    "orderId": "ord_42",
    "lat": 12.9716,
    "lng": 77.5946
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `orderId` | `string` | **yes** | The order ID to track (required). Can be obtained from get_orders tool. |
| `lat` | `number` | **yes** | Latitude of the delivery address (required for accurate tracking) |
| `lng` | `number` | **yes** | Longitude of the delivery address (required for accurate tracking) |

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
  orderId: string;
  orderTitle: string;
  orderSubtitle: string;
  status: {
    statusMessage: string;
    subStatusMessage?: string;
    etaMinutes?: number;
    etaText?: string;
  };
  storeInfo?: { name: string; address: string };
  deliveryInfo?: { addressLabel?: string; fullAddress: string };
  items: Array<{ name: string; quantity: number; price: string }>;
  itemCount: number;
  placedAt?: string;
  paymentInfo?: { message: string; amount?: string };
  mapInfo?: {
    storeLocation?: TrackLocation;
    storeAnnotation?: string;
    deliveryLocation?: TrackLocation;
    deliveryAnnotation?: string;
    riderLocation?: TrackLocation;
  };
  pollingIntervalSeconds: number;
}

type TrackLocation = {
  latitude: number;
  longitude: number;
}
```

This schema documents the structured payload returned by `track_order`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `status` / `statusMessage`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `pollingIntervalSeconds`: polling hints for status refreshes. Do not poll faster than the returned interval; stop when a terminal status is returned.
- `etaText` / `etaMinutes`: ETA/tracking fields. Use formatted ETA text when present; timestamp fields can be used to compute countdowns.
- `latitude` / `longitude`: coordinates from the selected saved location or restaurant context. Reuse returned values for follow-up slot, tracking, or payment calls; do not infer them from address text.
- `price`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `track_order` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Track |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`get_order_details`](/docs/reference/instamart/get_order_details.md).
