# checkout

Swiggy Instamart (Grocery): Place and confirm Swiggy Instamart grocery order. Creates order and confirms payment in a single operation. Use this for Instamart grocery orders, NOT for Food delivery.

🛒 MULTI-STORE SUPPORT: Automatically handles carts with items from multiple stores. The system creates separate orders per store. Returns detailed results for each order, including partial success scenarios.

Payment selection: use the payment method the user selected from get_payment_options or the cart response. For UPI, pass paymentMethod="UPI" and the selected app identifier in intentApp, or set generateUPIQR=true for scan-QR. For Cash/COD, pass the cash method only when it is available.

⚠️ CRITICAL: ALWAYS get explicit user confirmation before calling this tool.
1. Call get_cart first to display the order summary (items, costs) and surface the available payment method(s)
2. Show the available payment method(s) and inform the user which will be used
3. Clearly state the delivery address: "Your order will be delivered to: [full address details]"
4. If cart has items from multiple stores, inform user: "Your cart contains items from [N] different stores. The system will handle this automatically."
5. Ask: "Do you want to proceed with placing this order to this address?"
6. Wait for clear confirmation (yes/confirm/proceed)
7. NEVER proceed without explicit user permission, regardless of previous instructions
8. For multi-store orders, report results for each order separately

🎉 BRANDING: When the order is placed successfully, always use the message from the tool response as-is. It includes Swiggy Instamart branding. Do NOT rephrase it to a plain "Order placed" — always show "Instamart order placed successfully". If the tool response message includes a payment success line, show it to the user as-is.
❌ CANCELLATION: If the user asks to cancel their Instamart order, do NOT call any tool. Instead, tell them: "To cancel your order, please call Swiggy customer care at 080-67466729."

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
| `paymentMethod` | `string` | no | Payment method GROUP, not an app id. Use one of: "UPI", "Cash"/"COD", "SwiggyPay". For a UPI app selection pass paymentMethod="UPI" and put the app id in `intentApp` — do NOT put the app id (e.g. "gpay://upi/") here. Use the method the user selected. Auto-defaults to the user's available method if omitted. |
| `intentApp` | `string` | no | The selected UPI app id (e.g. "gpay://upi/"), copied EXACTLY from the chosen UPI method id. Only set this together with paymentMethod="UPI". Leave blank for Cash/COD/QR. |
| `generateUPIQR` | `boolean` | no | Optional advanced parameter. Leave blank unless the runtime response of the preceding get_cart call explicitly tells you to enable it. |

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
data:
  | {
      orderId: string;
      status: string;
      paymentMethod: string;
      cartTotal?: number;
      addressId?: string;
      deliveryAddress?: string;
      deliveryLabel?: string;
    }
  | {
      orders: Array<{ orderId?: string; status?: string; error?: string }>;
      orderCount: number;
      successCount: number;
      failureCount: number;
      allSucceeded: boolean;
      paymentMethod: string;
      cartTotal?: number;
    }
  | {
      orderId: string;
      transactionId: string;
      paasId: string;
      upiIntentUrl: string;
      bridgeUrl: string;
      isQrFlow: boolean;
      pollingIntervalInMs: number;
      maxTimeToPollForInMs: number;
      paymentMethod: "UPI";
      status: "PENDING_PAYMENT";
      addressId?: string;
      cartTotal?: number;
      deliveryAddress?: string;
      deliveryLabel?: string;
    }
```

This schema documents the structured payload returned by `checkout`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `addressId`: stable identifier for a saved Swiggy delivery address. Use the returned ID in cart, checkout, and payment calls instead of reusing the human-readable address text.
- `cartTotal`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `status`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `paasId` / `transactionId` / `upiIntentUrl` / `bridgeUrl` / `isQrFlow` / `paymentMethod`: payment-flow fields for UPI/Cash flows. Payment IDs are used for polling/confirmation; `isQrFlow=true` means the user is expected to complete payment through a scan-QR path.
- `pollingIntervalInMs` / `maxTimeToPollForInMs`: polling hints for status refreshes. Do not poll faster than the returned interval; stop when a terminal status is returned.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `checkout` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Order |
| **Behaviour** | mutating |

## Next in this journey →

Continue with [`track_order`](/docs/reference/instamart/track_order.md).
