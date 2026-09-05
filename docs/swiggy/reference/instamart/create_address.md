# create_address

> Swiggy (Instamart/Food): Create a new delivery address for the authenticated user.

Swiggy (Instamart/Food): Create a new delivery address for the authenticated user.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "create_address",
  arguments: {
    fullAddress: "...",
    addressLine: "...",
    addressLine2: "...",
    city: "Bengaluru",
    postalCode: "...",
    addressCategory: "HOME",
    userName: "...",
    userPhone: "...",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "create_address",
  arguments={
    "fullAddress": "...",
    "addressLine": "...",
    "addressLine2": "...",
    "city": "Bengaluru",
    "postalCode": "...",
    "addressCategory": "HOME",
    "userName": "...",
    "userPhone": "...",
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
      "name": "create_address",
      "arguments": {
    "fullAddress": "...",
    "addressLine": "...",
    "addressLine2": "...",
    "city": "Bengaluru",
    "postalCode": "...",
    "addressCategory": "HOME",
    "userName": "...",
    "userPhone": "..."
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `fullAddress` | `string` | **yes** | Complete address as provided by the user |
| `addressLine` | `string` | **yes** | Main street/building/house number (REQUIRED) |
| `addressLine2` | `string` | **yes** | Apartment, floor, wing, or additional details (REQUIRED - extract from full address, use empty string "" if not found) |
| `locality` | `string` | no | Area, neighborhood, or locality name (optional) |
| `city` | `string` | **yes** | City name (REQUIRED) |
| `postalCode` | `string` | **yes** | Postal/ZIP code (REQUIRED) |
| `latitude` | `number` | no | Latitude coordinate of the address (optional — the server will geocode from the address if omitted) |
| `longitude` | `number` | no | Longitude coordinate of the address (optional — the server will geocode from the address if omitted) |
| `addressCategory` | `"HOME" \| "WORK" \| "OFFICE" \| "FRIENDS_AND_FAMILY" \| "OTHER"` | **yes** | Type of address: HOME, WORK, OFFICE, FRIENDS_AND_FAMILY, or OTHER (REQUIRED) |
| `addressTag` | `string` | no | Friendly name/label for the address (e.g., "My Home", "Office", "Mom's Place") (optional) |
| `userName` | `string` | **yes** | Account holder name (authenticated user) (REQUIRED) |
| `userPhone` | `string` | **yes** | Account holder phone number (authenticated user) (REQUIRED) |
| `receiverName` | `string` | no | Receiver name if delivering to someone else (optional) |
| `receiverPhone` | `string` | no | Receiver phone if delivering to someone else (optional) |

Session credentials (user identity, access token) are supplied automatically by the authenticated MCP session - you do not pass them in the tool call. See [Authenticate](/docs/start/authenticate.md).

## Response

Success:

```json
{
  "success": true,
  "data": { "addressId": "addr_new_123" },
  "message": "Address created successfully"
}
```

- `data.addressId` — use this directly in subsequent calls (`search_products`, `get_cart`, `update_cart`, `checkout`). No need to call `get_addresses` again.

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
  addressId: string;
}
```

This schema documents the structured payload returned by `create_address`. `addressId` is the stable identifier for the saved address; use it in subsequent cart, checkout, and payment calls. Latitude and longitude are optional and are geocoded server-side when omitted.

> **Generally available:** As of Aug 2026, `create_address` is available to every authenticated Swiggy user — no whitelist or feature flag. Latitude and longitude are optional; the server geocodes from the address (via the address-recommendations service) when they are omitted.

## Details

| Field | Value |
| --- | --- |
| **Name** | `create_address` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Discover |
| **Behaviour** | mutating |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

**WORKFLOW **- What to ASK the user:
1. Ask: "What is your complete delivery address?" (Get the full address as a single string)
2. Ask: "What is your name?"
3. Ask: "What is your phone number?"
4. Ask: "What type of address is this?" (Options: HOME, WORK, OFFICE, FRIENDS_AND_FAMILY, or OTHER)
5. Ask (optional): "Would you like to give a name/label to this address?" (e.g., "My Home", "Office")
6. Ask: "Is this address for you or someone else?"
   - If for someone else: Ask for the receiver's name and phone number
7. (Optional) If the user provides latitude/longitude, include them — otherwise the server will geocode from the address automatically.

**AUTOMATIC PARSING **- What YOU must do (DO NOT ask user for these):
After getting the full address, YOU must automatically parse it and extract:
- addressLine: Main street/building/house number (REQUIRED - extract from full address)
- addressLine2: Apartment/floor/wing/additional details (REQUIRED - extract from full address)
- city: City name (REQUIRED - extract from full address)
- postalCode: Postal/ZIP code (REQUIRED - extract from full address)
- locality: Area/neighborhood (optional - extract if available)

> **Warning**
>
> CRITICAL RULES:

- NEVER ask the user to provide addressLine, addressLine2, city, or postalCode separately
- YOU parse the full address and extract these components automatically
- The user provides: full address, name, phone, address type, optional tag, and receiver details if applicable
- Latitude and longitude are optional — do NOT ask the user for coordinates unless they volunteer them. The server geocodes from the address when omitted
- Account details (userName, userPhone) are ALWAYS the authenticated user
- Receiver details (receiverName, receiverPhone) are only used when delivering to someone else

## Next in this journey →

Continue with [`search_products`](/docs/reference/instamart/search_products.md).
