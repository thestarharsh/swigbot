# cancel_booking

Swiggy Dineout (Reservations): Cancel an existing table reservation by orderId. Call this when the user clearly asks to cancel, drop, or remove a confirmed booking. You MUST already have the orderId — either from an earlier book_table response in this conversation, or by asking the user to provide it. IF YOU DO NOT HAVE AN orderId: do NOT call this tool. Ask the user: "To cancel a reservation I need the order ID from your booking confirmation. Do you have one, or would you like to make a new booking first?" Always show a brief confirmation summary (e.g., "Are you sure you want to cancel order &lt;orderId&gt;?") before calling, since cancellation is destructive. If the tool returns success: false, tell the user to use the Swiggy Dineout app or call customer care at 080-67466729.

## Usage notes

- This tool is not completely rolled out yet; it may not appear in `tools/list` for every user or account.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "cancel_booking",
  arguments: {
    orderId: "ord_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "cancel_booking",
  arguments={
    "orderId": "ord_42",
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
      "name": "cancel_booking",
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
| `orderId` | `string` | **yes** | The order ID of the booking to cancel (from book_table response). |
| `cancellationReason` | `string` | no | Optional short reason for cancellation (e.g., "plan changed", "wrong restaurant"). Not shown to the user. |

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
  status: "CANCELLED";
  cancelledAt: string;
}
```

This schema documents the structured payload returned by `cancel_booking`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `status`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `cancelledAt`: cancellation fields. Ask for user confirmation before calling a cancellation tool.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `cancel_booking` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Manage |
| **Behaviour** | mutating |
