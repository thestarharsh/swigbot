# search_products

Search for products available at the selected address. Returns products with their variants (e.g., different pack sizes, quantities). When a user asks to add a product, ALWAYS search first to see available variants, then ask the user which specific variant they want before adding to cart. Authentication is handled automatically.

⚠️ REQUIRED WORKFLOW: You MUST call get_addresses first to obtain a valid addressId, then pass that addressId to this tool. NEVER guess, invent, or use placeholder values like "default", "1", "N/A", or "REPLACE_WITH_*". The addressId must come from get_addresses response.

## Example

**TypeScript**
```ts
const result = await client.callTool({
  name: "search_products",
  arguments: {
    addressId: "addr_01HXYZ",
    query: "biryani",
  },
});
```

**Python**
```py
result = await session.call_tool(
  "search_products",
  arguments={
    "addressId": "addr_01HXYZ",
    "query": "biryani",
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
      "name": "search_products",
      "arguments": {
    "addressId": "addr_01HXYZ",
    "query": "biryani"
      }
    },
    "id": 1
  }'
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `addressId` | `string` | **yes** | REQUIRED: Address ID obtained from get_addresses tool. You MUST call get_addresses first to get this value. Do NOT invent or guess addressId values. |
| `query` | `string` | **yes** | REQUIRED: Search query (product name, category, or brand). Cannot be empty. |
| `offset` | `number` | no | Pagination offset (default: 0) |

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
  nextOffset: string;
  products: SearchProduct[];
  similarProducts?: SearchProduct[];
}

type SearchProduct = {
  displayName: string;
  brand: string;
  inStock: boolean;
  isAvail: boolean;
  productId: string;
  parentProductId: string;
  isPromoted?: boolean;
  badges?: Array<{ type: string; text: string; backgroundColor?: string }>;
  variations: Array<{
    spinId: string;
    skuId: string;
    quantityDescription: string;
    displayName: string;
    brandName: string;
    price: { mrp: number; offerPrice: number; unitLevelPrice?: string };
    isInStockAndAvailable: boolean;
    imageUrl?: string;
    rating?: { value: string; count: string };
    sla?: { value: string; unit: string };
    vegClassifier?: string;
    maxQuantity?: number;
    maxQuantityMessage?: string;
  }>;
}
```

This schema documents the structured payload returned by `search_products`. Optional fields can vary by user state, cart state, and live Swiggy availability.

### Schema notes

- `spinId` / `skuId` / `productId` / `parentProductId`: Instamart product/SKU identifiers. Use returned SKU-level IDs from the selected product variation when updating an Instamart cart; product-level IDs identify the broader product family.
- `nextOffset`: pagination fields. Use them only to fetch or display more results from the same query/list; do not treat offsets as item IDs.
- `inStock` / `isInStockAndAvailable` / `isAvail`: live availability fields. If an item is out of stock, unserviceable, or quantity-capped, show the returned reason/message and refresh before checkout.
- `price` / `mrp` / `offerPrice`: item-level price fields. They may differ before and after coupons, variants, add-ons, or stock updates; use cart/order totals for checkout.
- `rating`: display/ranking signals. Do not use them as stable identifiers for follow-up calls.
- Fields marked optional may be omitted depending on user state, cart/order state, and live Swiggy availability.
- Use returned identifiers and enum values exactly as provided; do not invent fallback IDs, status values, payment methods, or timestamps.

## Details

| Field | Value |
| --- | --- |
| **Name** | `search_products` |
| **MCP Server** | [Instamart](/docs/reference/instamart.md) |
| **Endpoint** | `POST mcp.swiggy.com/im` |
| **Stage** | Discover |
| **Behaviour** | read-only |

## Next in this journey →

Continue with [`update_cart`](/docs/reference/instamart/update_cart.md).
