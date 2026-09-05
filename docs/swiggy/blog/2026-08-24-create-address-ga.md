# Address, Created: create_address Goes GA on Swiggy MCP

> create_address and delete_address are now available to every authenticated Swiggy user — no whitelist, no app handoff. Lat/lng are optional too: the server geocodes from the address itself.

> **Stop sending users to the app to add an address.** As of August 2026, `create_address` and `delete_address` are generally available to every authenticated Swiggy user through MCP — no whitelist, no feature flag. Your agent can now own the entire address lifecycle in the conversation.

Until now, address management on Swiggy MCP was gated behind a per-user whitelist: only approved users could see or call `create_address` / `delete_address`, and everyone else got a `"user is not whitelisted"` error that forced a handoff back to the Swiggy app. That gate is gone. The tools are now visible in every user's toolbox and callable by any authenticated session.

We also took the opportunity to make coordinates optional, so the agent never has to ask for them.

## What changed

- **No whitelist.** `create_address` and `delete_address` are no longer filtered out of the toolbox for non-whitelisted users. The CP keys `ADDRESS_MANAGEMENT_WHITELISTED_USERS` and `IM_CREATE_ADDRESS_ALLOWED_INTEGRATIONS` are removed from the config surface; the `filterAddressMgmtGatedTools` step is dropped from the tool-listing pipeline.
- **No "user is not whitelisted" error.** A direct JSON-RPC call from any authenticated user now succeeds (or fails for a real business reason — bad address, unlocatable, etc.), instead of being rejected at the gate.
- **Lat/lng are optional.** When the caller omits `latitude` / `longitude`, the server geocodes the address server-side via the `address-recommendations` service and fills them in before the create call. Coordinates are only required if the geocoder can't resolve the address — in which case you get a clear `ExpectedBusinessError`, not a half-built request.

## The journey, end to end in chat

```
get_addresses              ──► list saved addresses (no coords, phone masked)
        │
        ▼
   (none fit?) ──► create_address ──► geocode (server-side) ──► addressId
        │
        ▼
search_products / get_cart / update_cart / checkout
        │
        ▼
   (cleanup) ──► delete_address
```

The key change is the middle box: `create_address` used to be the step that broke the journey for un-whitelisted users. Now it just works, and it returns the new `addressId` directly — you hand it straight to `search_products`, `get_cart`, `update_cart`, or `checkout` without re-calling `get_addresses`.

## How to call it

`create_address` takes a single free-form `fullAddress` string plus a handful of parsed components, and it asks the agent to do the parsing — not the user.

```ts
const result = await client.callTool({
  name: "create_address",
  arguments: {
    fullAddress: "12B, Sobha Lotus, Sarjapur Road, Bengaluru 560103",
    addressLine: "12B, Sobha Lotus",
    addressLine2: "Sarjapur Road",
    locality: "Sarjapur",
    city: "Bengaluru",
    postalCode: "560103",
    addressCategory: "HOME",
    addressTag: "Home",
    userName: "Shivam Shrivastava",
    userPhone: "+91xxxxxxxxxx",
  },
});
// → { success: true, data: { addressId: "addr_new_123" } }
```

A few rules worth keeping in your prompts:

- **Ask the user for `fullAddress`, name, phone, category, and (optional) tag only.** Parse `addressLine`, `addressLine2`, `city`, `postalCode`, and `locality` yourself — never ask the user for those field-by-field.
- **Don't ask for coordinates.** Omit `latitude` / `longitude` and let the server geocode. Only pass them if the user volunteers them.
- **`userName` / `userPhone` are always the authenticated account holder.** Use `receiverName` / `receiverPhone` only when delivering to someone else.
- **`addressCategory` is one of** `HOME`, `WORK`, `OFFICE`, `FRIENDS_AND_FAMILY`, or `OTHER`.

## When geocoding fails

If the `address-recommendations` service can't resolve the address (ZERO_RESULTS, an unlocatable string, or a network failure), `create_address` throws an `ExpectedBusinessError` with a user-friendly message and **never** builds a create request with null coordinates. That's a business error, not a tool error — surface it to the user and ask them to re-enter or correct the address, rather than retrying blindly.

## What to do in your client

If you built any of these, you can take them out:

- A fallback that tells users to "open the Swiggy app to add an address" — your agent can create it directly now.
- A branch that special-cased the `"user is not whitelisted"` error from `create_address` / `delete_address`.
- Any client-side gating that hid the address tools for non-whitelisted users.

## Reference

- [`create_address`](/docs/reference/instamart/create_address.md) — parameters, response, and the full agent guidance.
- [`delete_address`](/docs/reference/instamart/delete_address.md) — the matching remove flow.
- [`get_addresses`](/docs/reference/instamart/get_addresses.md) — the read side (recency-sorted, paginated, coordinates stripped).
- Questions? Write to us: [builders@swiggy.in](mailto:builders@swiggy.in)
