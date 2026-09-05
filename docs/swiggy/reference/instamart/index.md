# Instamart

> Swiggy Instamart MCP Server - Your AI-powered grocery and essentials shopping assistant. Get everything delivered in minutes — from fresh fruits, vegetables, dairy, and staples to snacks, beverages, …

Swiggy Instamart MCP Server - Your AI-powered grocery and essentials shopping assistant. Get everything delivered in minutes — from fresh fruits, vegetables, dairy, and staples to snacks, beverages, personal care, electronics, baby care, pet supplies, and more. Browse a wide variety of products across 50+ categories, enjoy great deals, manage your cart, and place orders with quick delivery right to your doorstep.

- **Endpoint**: `POST mcp.swiggy.com/im`
- **Tools available**: 19

## Tools by stage

### Discover

| Tool | Description |
| --- | --- |
| [`create_address`](/docs/reference/instamart/create_address.md) | Swiggy (Instamart/Food): Create a new delivery address for the authenticated user. |
| [`delete_address`](/docs/reference/instamart/delete_address.md) | Swiggy (Instamart/Food): Delete a saved delivery address for the authenticated user. |
| [`get_addresses`](/docs/reference/instamart/get_addresses.md) | Swiggy (Instamart/Food): Get saved delivery addresses for the authenticated Swiggy user, sorted by last order date (most recent first). Thi… |
| [`search_products`](/docs/reference/instamart/search_products.md) | Search for products available at the selected address. Returns products with their variants (e.g., different pack sizes, quantities). When … |
| [`your_go_to_items`](/docs/reference/instamart/your_go_to_items.md) | Fetch the user's Your Go To Items (frequently or recently ordered items) for the selected delivery address. Use addressId from get_addresse… |

### Cart

| Tool | Description |
| --- | --- |
| [`apply_coupon`](/docs/reference/instamart/apply_coupon.md) | Swiggy Instamart (Grocery): Apply a coupon code to the current Instamart cart. Returns the updated cart with the discount reflected in the … |
| [`clear_cart`](/docs/reference/instamart/clear_cart.md) | Clear (remove all items from) the Instamart cart. Authentication is handled automatically. |
| [`get_cart`](/docs/reference/instamart/get_cart.md) | Swiggy Instamart (Grocery): Get current Swiggy Instamart grocery cart with all items and bill breakdown. Use this for Instamart grocery ord… |
| [`list_coupons`](/docs/reference/instamart/list_coupons.md) | Swiggy Instamart (Grocery): List available coupons for the current cart. Fetches applicable coupon offers based on the items in your cart a… |
| [`update_cart`](/docs/reference/instamart/update_cart.md) | Swiggy Instamart (Grocery): Update Swiggy Instamart grocery cart with items. Replaces entire cart with the provided items. Use this for Ins… |

### Payment

| Tool | Description |
| --- | --- |
| [`check_payment_status`](/docs/reference/instamart/check_payment_status.md) | Check one payment-status iteration for an in-flight UPI payment. Use the returned terminal flags and message to decide whether to stop poll… |
| [`confirm_order`](/docs/reference/instamart/confirm_order.md) | Complete an order after payment succeeds. For UPI flows, the place-order tool first returns `PENDING_PAYMENT`; call this only after `check_… |
| [`get_payment_options`](/docs/reference/instamart/get_payment_options.md) | Fetch the live payment methods currently available for the cart. Use this when the user is ready to pay or asks which payment options are a… |

### Order

| Tool | Description |
| --- | --- |
| [`checkout`](/docs/reference/instamart/checkout.md) | Swiggy Instamart (Grocery): Place and confirm Swiggy Instamart grocery order. Creates order and confirms payment in a single operation. Use… |

### Track

| Tool | Description |
| --- | --- |
| [`get_delivery_status`](/docs/reference/instamart/get_delivery_status.md) | Get the latest delivery ETA and status for an Instamart order. |
| [`get_order_details`](/docs/reference/instamart/get_order_details.md) | Get detailed information for a specific Swiggy Instamart order by order ID. Use this when the user wants to see complete details about a sp… |
| [`get_orders`](/docs/reference/instamart/get_orders.md) | Swiggy Instamart order history - Use this to fetch ORDER HISTORY, past orders, or order preferences. Use this FIRST when user asks: "show m… |
| [`track_order`](/docs/reference/instamart/track_order.md) | Track Swiggy Instamart order status in real-time. PRIMARY TOOL for order tracking - Use this FIRST when user asks: "where is my order", "tr… |

### Support

| Tool | Description |
| --- | --- |
| [`report_error`](/docs/reference/instamart/report_error.md) | Generate an error report to share with the Swiggy MCP team. Use this when the user encounters an error and wants to report it. Returns a pr… |

## Related

- [Authenticate](/docs/start/authenticate.md)
- [Error codes](/docs/reference/errors.md)
- [Quickstart](/docs/start/developer.md)
