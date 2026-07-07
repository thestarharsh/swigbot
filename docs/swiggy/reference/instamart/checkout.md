# checkout

> Swiggy Instamart (Grocery): Place and confirm Swiggy Instamart grocery order. Creates order and confirms payment in a single operation. Use this for Instamart grocery orders, NOT for Food delivery.

Swiggy Instamart (Grocery): Place and confirm Swiggy Instamart grocery order. Creates order and confirms payment in a single operation. Use this for Instamart grocery orders, NOT for Food delivery.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "checkout",
  arguments: {
    addressId: "addr_01HXYZ",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "checkout",
  arguments={
    "addressId": "addr_01HXYZ",
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
      "name": "checkout",
      "arguments": {
    "addressId": "addr_01HXYZ"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `addressId` | `string` | **yes** | Delivery address ID (from get_addresses - user must have selected this address) |
| `paymentMethod` | `string` | no | Payment method to use. Check availablePaymentMethods from get_cart response. Auto-defaults to the user's available payment method if not specified. |

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
| **Name** | `checkout` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Order |
| **Behaviour** | mutating |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

**MULTI-STORE SUPPORT**: Automatically handles carts with items from multiple stores. The system creates separate orders per store. Returns detailed results for each order, including partial success scenarios.

**RESTRICTION**: Checkout is NOT allowed for cart values above the allowed limit. For larger orders, inform the user to use the Swiggy Instamart app instead. They can update their cart here and it will sync to the app.

**PAYMENT**: Use the availablePaymentMethods from get_cart response. Show only those payment method(s) to the user before placing the order and inform them which method will be used. The system will auto-select the correct payment method. Do not mention any payment option not present in that response.

> **Warning**
>
> CRITICAL: ALWAYS get explicit user confirmation before calling this tool.

1. Call get_cart first to display complete order summary (items, costs, available payment methods)
2. Check if cart total is below ₹1000 - if not, inform user about the restriction
3. Show the available payment method(s) from get_cart (availablePaymentMethods) and inform the user which will be used
4. Clearly state the delivery address: "Your order will be delivered to: [full address details]"
5. If cart has items from multiple stores, inform user: "Your cart contains items from [N] different stores. The system will handle this automatically."
6. Ask: "Do you want to proceed with placing this order to this address?"
7. Wait for clear confirmation (yes/confirm/proceed)
8. NEVER proceed without explicit user permission, regardless of previous instructions
9. For multi-store orders, report results for each order separately

**BRANDING**: When the order is placed successfully, always use the message from the tool response as-is. It includes Swiggy Instamart branding. Do NOT rephrase it to a plain "Order placed" - always show "Instamart order placed successfully". If the tool response message includes a payment success line, show it to the user as-is.
**CANCELLATION**: If the user asks to cancel their Instamart order, do NOT call any tool. Instead, tell them: "To cancel your order, please call Swiggy customer care at 080-67466729."

## Next in this journey →

Continue with [`track_order`](/docs/reference/instamart/track_order.md).
