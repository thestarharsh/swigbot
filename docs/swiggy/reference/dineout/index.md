# Dineout

> Swiggy Dineout MCP Server - Your AI-powered restaurant discovery and table booking assistant. Find the best restaurants near you, explore exclusive deals and offers, check real-time availability, and…

Swiggy Dineout MCP Server - Your AI-powered restaurant discovery and table booking assistant. Find the best restaurants near you, explore exclusive deals and offers, check real-time availability, and book tables instantly — all for free.

- **Endpoint**: `POST mcp.swiggy.com/dineout`
- **Tools available**: 12

## Tools by stage

### Find

| Tool | Description |
| --- | --- |
| [`get_restaurant_details`](/docs/reference/dineout/get_restaurant_details.md) | Swiggy Dineout (Reservations): Get details about a specific restaurant for TABLE BOOKING. NOT for food delivery or grocery orders. Returns … |
| [`get_saved_locations`](/docs/reference/dineout/get_saved_locations.md) | Swiggy Dineout (Reservations): Get user's saved addresses for restaurant search. NOT for food delivery or grocery orders. Returns address I… |
| [`search_restaurants_dineout`](/docs/reference/dineout/search_restaurants_dineout.md) | Swiggy Dineout (Reservations): find restaurants to BOOK A TABLE at. Use when the user wants to go out and eat. NOT for food delivery or gro… |

### Reserve

| Tool | Description |
| --- | --- |
| [`book_table`](/docs/reference/dineout/book_table.md) | Swiggy Dineout (Reservations): Book a table at a restaurant for a specific time slot. NOT for food delivery or grocery orders. Books FREE r… |
| [`create_cart`](/docs/reference/dineout/create_cart.md) | Swiggy Dineout (Reservations): Create a booking cart. NOT for food delivery or grocery orders. Use this for PAID prebook deals (isFree=fals… |
| [`get_available_slots`](/docs/reference/dineout/get_available_slots.md) | Swiggy Dineout (Reservations): Check available time slots for TABLE BOOKING at a restaurant. NOT for food delivery or grocery orders. Retur… |

### Payment

| Tool | Description |
| --- | --- |
| [`check_payment_status`](/docs/reference/dineout/check_payment_status.md) | Check one payment-status iteration for an in-flight UPI payment. Use the returned terminal flags and message to decide whether to stop poll… |
| [`confirm_order`](/docs/reference/dineout/confirm_order.md) | Complete an order after payment succeeds. For UPI flows, the place-order tool first returns `PENDING_PAYMENT`; call this only after `check_… |
| [`get_payment_options`](/docs/reference/dineout/get_payment_options.md) | Fetch the live payment methods currently available for the cart. Use this when the user is ready to pay or asks which payment options are a… |

### Manage

| Tool | Description |
| --- | --- |
| [`cancel_booking`](/docs/reference/dineout/cancel_booking.md) | Swiggy Dineout (Reservations): Cancel an existing table reservation by orderId. Call this when the user clearly asks to cancel, drop, or re… |
| [`get_booking_status`](/docs/reference/dineout/get_booking_status.md) | Swiggy Dineout (Reservations): Get booking status and details for a dineout reservation. NOT for food delivery or grocery orders. Returns r… |

### Support

| Tool | Description |
| --- | --- |
| [`report_error`](/docs/reference/dineout/report_error.md) | Generate an error report to share with the Swiggy MCP team. Use this when the user encounters an error and wants to report it. Returns a pr… |

## Related

- [Authenticate](/docs/start/authenticate.md)
- [Error codes](/docs/reference/errors.md)
- [Quickstart](/docs/start/developer.md)
