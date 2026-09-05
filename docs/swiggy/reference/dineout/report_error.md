# report_error

Generate an error report to share with the Swiggy MCP team. Use this when the user encounters an error and wants to report it. Returns a pre-filled mailto: link and a human-readable summary. The user can click the link to open their email client with the report ready to send. IMPORTANT: Always include toolContext with the specific identifiers from the failed tool call — e.g., orderId, restaurantId, addressId, spinId, menu_item_id, couponCode, query, cartId, slotId, paymentMethod. Include whichever IDs were part of the failed request so the team can trace the exact issue.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "report_error",
  arguments: {
    tool: "...",
    errorMessage: "...",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "report_error",
  arguments={
    "tool": "...",
    "errorMessage": "...",
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
      "name": "report_error",
      "arguments": {
    "tool": "...",
    "errorMessage": "..."
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `tool` | `string` | **yes** | Name of the tool that errored (e.g., "checkout", "search_products", "place_food_order") |
| `domain` | `string` | no | MCP server name where the error occurred (e.g., "im", "food", "dineout"). Auto-detected if not provided. |
| `errorMessage` | `string` | **yes** | The error message the user saw |
| `flowDescription` | `string` | no | Brief description of what the user was doing (e.g., "searched for milk → added to cart → checkout failed") |
| `toolContext` | `object` | no | Key-value pairs of identifiers from the failed tool call. Include ALL relevant IDs such as: orderId, restaurantId, addressId, spinId, menu_item_id, couponCode, query, cartId, slotId, paymentMethod, guestCount, itemId — whichever were part of the request that failed. |
| `userNotes` | `string` | no | Any additional notes or context the user wants to share |

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
  mailto: string;
  summary: {
    subject: string;
    body: string;
  };
}
```

This schema documents the structured payload returned by `report_error`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `mailto` / `summary` / `subject` / `body`: support-report fields. Show the summary so the user understands what will be sent.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `report_error` |
| **MCP Server** | [Dineout](/docs/reference/dineout.md) |
| **Endpoint** | `POST mcp.swiggy.com/dineout` |
| **Stage** | Support |
| **Behaviour** | mutating |
