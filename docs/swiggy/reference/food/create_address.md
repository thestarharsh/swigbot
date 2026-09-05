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
curl -X POST https://mcp.swiggy.com/food \
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
| `latitude` | `number` | no | Latitude coordinate of the address (optional - auto-resolved from address if omitted) |
| `longitude` | `number` | no | Longitude coordinate of the address (optional - auto-resolved from address if omitted) |
| `addressCategory` | `"HOME" \| "WORK" \| "OFFICE" \| "FRIENDS_AND_FAMILY" \| "OTHER"` | **yes** | Type of address: HOME, WORK, OFFICE, FRIENDS_AND_FAMILY, or OTHER (REQUIRED) |
| `addressTag` | `string` | no | Friendly name/label for the address (e.g., "My Home", "Office", "Mom's Place") (optional) |
| `userName` | `string` | **yes** | Account holder name (authenticated user) (REQUIRED) |
| `userPhone` | `string` | **yes** | Account holder phone number (authenticated user) (REQUIRED) |
| `receiverName` | `string` | no | Receiver name if delivering to someone else (optional) |
| `receiverPhone` | `string` | no | Receiver phone if delivering to someone else (optional) |

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
  addressId: string;
}
```

## Details

| Field | Value |
| --- | --- |
| **Name** | `create_address` |
| **MCP Server** | [Food](/docs/reference/food.md) |
| **Endpoint** | `POST mcp.swiggy.com/food` |
| **Stage** | Discover |
| **Behaviour** | mutating |

## Agent guidance

How Swiggy agents and orchestration logic use this tool. Surface these expectations in your prompts or tool-selection policies.

📍 WORKFLOW - What to ASK the user:
1. Ask: "What is your complete delivery address?" (Get the full address as a single string)
2. Ask: "What is your name?"
3. Ask: "What is your phone number?"
4. Ask: "What type of address is this?" (Options: HOME, WORK, OFFICE, FRIENDS_AND_FAMILY, or OTHER)
5. Ask (optional): "Would you like to give a name/label to this address?" (e.g., "My Home", "Office")
6. Ask: "Is this address for you or someone else?"
   - If for someone else: Ask for the receiver's name and phone number

🤖 AUTOMATIC PARSING - What YOU must do (DO NOT ask user for these):
After getting the full address, YOU must automatically parse it and extract:
- addressLine: Main street/building/house number (REQUIRED - extract from full address)
- addressLine2: Apartment/floor/wing/additional details (REQUIRED - extract from full address)
- city: City name (REQUIRED - extract from full address)
- postalCode: Postal/ZIP code (REQUIRED - extract from full address)
- locality: Area/neighborhood (optional - extract if available)

🗺️ COORDINATES: latitude and longitude are optional. If omitted, they are auto-resolved from the address automatically.

⚠️ CRITICAL RULES:
- NEVER ask the user to provide addressLine, addressLine2, city, or postalCode separately
- YOU parse the full address and extract these components automatically
- The user provides: full address, name, phone, address type, optional tag, and receiver details if applicable
- Account details (userName, userPhone) are ALWAYS the authenticated user
- Receiver details (receiverName, receiverPhone) are only used when delivering to someone else

## Next in this journey →

Continue with [`search_restaurants`](/docs/reference/food/search_restaurants.md).
