# Dineout

> Swiggy Dineout MCP Server - Your AI-powered restaurant discovery and table booking assistant. Find the best restaurants near you, explore exclusive deals and offers, check real-time availability, and...

Swiggy Dineout MCP Server - Your AI-powered restaurant discovery and table booking assistant. Find the best restaurants near you, explore exclusive deals and offers, check real-time availability, and book tables instantly - all for free.

- **Endpoint**: `POST mcp.swiggy.com/dineout`
- **Tools available**: 8

## Tools by stage

### Find

| Tool | Description |
| --- | --- |
| [`get_restaurant_details`](/docs/reference/dineout/get_restaurant_details.md) | Swiggy Dineout: Get details about a specific restaurant for TABLE BOOKING. Returns ratings, deals, timings, address. Use restaurant ID from... |
| [`get_saved_locations`](/docs/reference/dineout/get_saved_locations.md) | Swiggy Dineout: Get user's saved addresses for restaurant search. Returns address IDs that can be passed to search_restaurants_dineout. |
| [`search_restaurants_dineout`](/docs/reference/dineout/search_restaurants_dineout.md) | Swiggy Dineout: Search restaurants for TABLE BOOKING/RESERVATIONS. Use when user wants to GO OUT and book a table. NOT for food delivery. R... |

### Reserve

| Tool | Description |
| --- | --- |
| [`book_table`](/docs/reference/dineout/book_table.md) | Swiggy Dineout (Reservations): Book a table at a restaurant for a specific time slot. Only supports FREE reservations (isFree=true, booking... |
| [`create_cart`](/docs/reference/dineout/create_cart.md) | Swiggy Dineout: Create a cart for TABLE BOOKING or bill payment. For booking (DEAL_TICKET_PURCHASE): requires restaurant ID, slot details, ... |
| [`get_available_slots`](/docs/reference/dineout/get_available_slots.md) | Swiggy Dineout (Reservations): Check available time slots for TABLE BOOKING at a restaurant. Returns slots across up to 7 days from the req... |

### Manage

| Tool | Description |
| --- | --- |
| [`get_booking_status`](/docs/reference/dineout/get_booking_status.md) | Get booking status and details for a dineout order. Returns restaurant name, date, time, guests, deal title, and status. Example: "What is ... |

### Support

| Tool | Description |
| --- | --- |
| [`report_error`](/docs/reference/dineout/report_error.md) | Generate an error report to share with the Swiggy MCP team. Use this when the user encounters an error and wants to report it. Returns a pr... |

## Related

- [Authenticate](/docs/start/authenticate.md)
- [Error codes](/docs/reference/errors.md)
- [Quickstart](/docs/start/developer.md)
