# get_booking_status

> Get booking status and details for a dineout order. Returns restaurant name, date, time, guests, deal title, and status. Example: \"What is the status of my booking?\" → Call with order ID.

Get booking status and details for a dineout order. Returns restaurant name, date, time, guests, deal title, and status. Example: "What is the status of my booking?" → Call with order ID.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "get_booking_status",
  arguments: {
    orderId: "ord_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "get_booking_status",
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
      "name": "get_booking_status",
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
| `orderId` | `string` | **yes** | Order ID from booking confirmation |

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

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_booking_status` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Manage |
| **Behaviour** | read-only |
