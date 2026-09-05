# get_order_details

Get detailed information for a specific Swiggy Instamart order by order ID. Use this when the user wants to see complete details about a specific order including: full list of items with quantities and prices, itemized bill breakdown (item total, delivery fee, handling fee, grand total), order status, and whether there are any refunds. This tool provides more detailed information than get_orders. Note: For store information, delivery address, or real-time tracking, use get_orders or track_order instead. To use this tool, you need an orderId which can be obtained from the get_orders tool first. Example use cases: "show me details of order 123456", "what items were in my last order", "show me the bill for order 123456", "what was the total for my recent order".

## Usage notes

- This tool is not completely rolled out yet; it may not appear in `tools/list` for every user or account.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_order_details",
  arguments: {
    orderId: "ord_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_order_details",
  arguments={
    "orderId": "ord_42",
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
      "name": "get_order_details",
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
| `orderId` | `string` | **yes** | The order ID to fetch details for (required). Can be obtained from get_orders tool. |

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
  status: string;
  totalBill: number;
  hasRefunds: boolean;
  items: Array<{
    name: string;
    quantity: number;
    finalPrice: number;
    removed: boolean;
  }>;
  bill: {
    lineItems: Array<{
      name: string;
      amount: string;
    }>;
    grandTotal: string;
  };
}
```

The order-details service returns a trimmed Instamart post-order payload. `status` is the human-readable status mapped from the upstream order enum.

### Schema notes

- `grandTotal`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `status`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_order_details` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Track |
| **Behaviour** | read-only |
