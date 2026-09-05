# get_food_delivery_status

Get the latest delivery ETA and terminal delivery state for a Food order. Use this for structured status polling after an order is placed; use `track_food_order` when the user asks for a conversational tracking update.

## Usage notes

- Use for structured delivery ETA refreshes after a Food order is placed.
- Do not call in a tight loop. Wait for `pollIntervalSec`, and stop when `cancelled` or `delivered` is `true`.
- For a user-facing conversational tracking answer, prefer `track_food_order`.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_food_delivery_status",
  arguments: {
    orderId: "ord_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_food_delivery_status",
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
      "name": "get_food_delivery_status",
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
| `orderId` | `string` | **yes** | Order ID to fetch the delivery ETA for (required). |

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
  deliveryBy: number | null; // epoch milliseconds
  serverNow: number; // epoch milliseconds
  etaText?: string;
  cancelled?: boolean;
  delivered?: boolean;
  statusText?: string;
  pollIntervalSec: number;
}
```

This schema documents the structured payload returned by `get_food_delivery_status`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `deliveryBy`: absolute ETA as epoch milliseconds. It can be `null` when the tracking service does not provide a parseable ETA.
- `serverNow`: server timestamp as epoch milliseconds at call time; clients can use it to compute a countdown.
- `pollIntervalSec`: recommended wait before the next delivery-status check.
- `cancelled` / `delivered`: terminal delivery flags. Stop delivery-status polling when either is `true`.
- `statusText`: human-readable tracking status, especially useful when numeric ETA is unavailable.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `pollIntervalSec`: polling hints for status refreshes. Do not poll faster than the returned interval; stop when a terminal status is returned.
- `deliveryBy` / `serverNow` / `etaText`: ETA/tracking fields. Use formatted ETA text when present; timestamp fields can be used to compute countdowns.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_food_delivery_status` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Track |
| **Behaviour** | read-only |
