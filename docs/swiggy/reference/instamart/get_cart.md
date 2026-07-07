# get_cart

> Swiggy Instamart (Grocery): Get current Swiggy Instamart grocery cart with all items and bill breakdown. Use this for Instamart grocery orders, NOT for Food delivery. Authentication is handled automa...

Swiggy Instamart (Grocery): Get current Swiggy Instamart grocery cart with all items and bill breakdown. Use this for Instamart grocery orders, NOT for Food delivery. Authentication is handled automatically.

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

## Details

| Field | Value |
| --- | --- |
| **Name** | `get_cart` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Cart |
| **Behaviour** | read-only |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

**PAYMENT METHODS**: The response includes an "availablePaymentMethods" array in data. Display whatever payment method(s) are returned to the user before placing the order. Do not mention or assume any payment option that is not in the response.

## Next in this journey →

Continue with [`checkout`](/docs/reference/instamart/checkout.md).
