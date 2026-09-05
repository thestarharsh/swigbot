# check_payment_status

Check one payment-status iteration for an in-flight UPI payment. Use the returned terminal flags and message to decide whether to stop polling, retry payment, or complete the order.

## Usage notes

- In widget-enabled clients, the payment widget normally polls this tool automatically and finalizes the order when it can. Do not start your own poll loop unless you are building a headless client.
- Call manually only when the user explicitly asks for a payment update, or when your client cannot use the payment widget.
- If you call it manually, use the polling interval returned by the place-order response. Do not repeatedly call this endpoint without waiting.
- On successful terminal status, follow the returned message and flags. If `confirmed=true`, the order is already finalized and you should not call `confirm_order` again.
- Call `confirm_order` only when payment succeeded but the response says auto-confirm could not run or you are running a headless flow that must finalize explicitly.
- On failed, cancelled, refund-initiated, or cart-changed terminal status, do not call `confirm_order`; offer a fresh payment attempt where appropriate.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "check_payment_status",
  arguments: {
    paasId: "paas_42",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "check_payment_status",
  arguments={
    "paasId": "paas_42",
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
      "name": "check_payment_status",
      "arguments": {
    "paasId": "paas_42"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `paasId` | `string` | **yes** | The payment TRANSACTION id from the place-order/checkout response (response field "paasId", e.g. a long numeric/alphanumeric id). NOT the payment-method name — never pass "PayWithQR", "UPI", "UPIIntent", or an app package id here. If you do not have a real paasId, do not call this tool; re-read the checkout response which contains paasId + orderId. |
| `orderId` | `string` | no | Order ID from the place-order or checkout response. Pass it when the tool response included an order ID. |
| `addressId` | `string` | no | Food only: echo from place_food_order — passed through for auto-confirm. |
| `cartId` | `string` | no | Food only: echo from place_food_order — passed through for auto-confirm. |
| `lat` | `number` | no | Food only: echo from place_food_order — passed through for auto-confirm. |
| `lng` | `number` | no | Food only: echo from place_food_order — passed through for auto-confirm. |

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
  paasId: string;
  status: string;
  terminal: boolean;
  isTerminalSuccess: boolean;
  isTerminalFailure: boolean;
  confirmed?: boolean;
  orderStatus?: string;
  cartTotal?: number;
  orderId?: string;
  addressId?: string;
  cartId?: string;
  lat?: number;
  lng?: number;
}
```

This schema documents the structured payload returned by `check_payment_status`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- Call this on the cadence returned by the place-order tool. Do not poll in a tight loop.
- `terminal`: `true` means stop polling this payment attempt.
- `isTerminalSuccess`: payment succeeded. Check `confirmed` and the response message before deciding whether a separate `confirm_order` call is needed.
- `isTerminalFailure`: payment failed or cannot proceed; do not call `confirm_order`. Offer the user another payment attempt.
- `confirmed`: when present and true, order completion has already happened as part of the payment-status flow. Do not call `confirm_order` again for that payment attempt.
- `addressId`: stable identifier for a saved Swiggy delivery address. Use the returned ID in cart, checkout, and payment calls instead of reusing the human-readable address text.
- `cartId`: server-side cart reference for the current authenticated session. Use it only for the immediate follow-up flow; refresh the cart if the user changes items, address, slot, or payment path.
- `cartTotal`: payable/order total fields. Show these as live values and refresh the cart or order state before final placement if anything changes.
- `status` / `orderStatus`: service state fields. Prefer accompanying messages/terminal flags and refresh status before taking irreversible actions.
- `orderId`: order identifier for tracking, support, payment confirmation, and cancellation flows. Preserve formatting exactly as returned.
- `paasId`: payment-flow fields for UPI/Cash flows. Payment IDs are used for polling/confirmation; `isQrFlow=true` means the user is expected to complete payment through a scan-QR path.
- `terminal` / `isTerminalSuccess` / `isTerminalFailure` / `confirmed`: payment terminal-state fields. Call confirmation only after a successful terminal payment and only when the order has not already been confirmed; never confirm after a terminal failure.
- `lat` / `lng`: coordinates from the selected saved location or restaurant context. Reuse returned values for follow-up slot, tracking, or payment calls; do not infer them from address text.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `check_payment_status` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Payment |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`confirm_order`](/docs/reference/food/confirm_order.md).
