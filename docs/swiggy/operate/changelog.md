# Changelog

> What shipped when, grouped by release.

Tool-level changes are auto-discoverable from the [reference](/docs/reference.md) pages (regenerated on every source change). This page tracks platform-level releases - new tools, new scopes, deprecations.

## v1.0 - 2026-04 (Builders Club launch)

**Shipped**

- Three MCP servers live: Food (14 tools), Instamart (13 tools), Dineout (8 tools).
- OAuth 2.1 authorization-code flow with PKCE (S256) on all endpoints. JWT signature validation is performed at the HAProxy edge.
- Streamable HTTP transport per [MCP spec](https://modelcontextprotocol.io).
- India-only region (AWS Mumbai primary, Singapore failover).
- Food widget registry wired (`hasWidgets: true`) - hosted iframe layer ships in v1.1.
- `llms.txt` + `llms-full.txt` at the docs root for agent-driven discovery.

**Known limitations**

- Cash-on-delivery only on Food ordering.
- Food cart cap ₹1000 for Builders Club origin orders.
- No refresh-token issuance (re-run OAuth on expiry; the 5-day access token usually makes this silent).
- MCP-layer rate limiting not enforced; abusive traffic is shed upstream. Developer-tier ceilings are advisory (see [rate-limits](/docs/operate/rate-limits.md)).
- Symbolic `error.code` registry not yet populated - agents should branch on `error.message` + HTTP status (see [errors](/docs/reference/errors.md)).
- `_meta.swiggy.deprecation` response field not yet emitted (see [versioning](/docs/operate/versioning.md)).
- Instamart and Dineout widgets not yet shipped.
- Status page not yet live (incident comms via email).

## Roadmap

Items we've committed to, not yet shipped:

- **v1.1** - Refresh tokens; status page live at `status.swiggy.com/mcp`; MCP-layer rate limiting with `X-RateLimit-*` headers and 429/`Retry-After`; symbolic `error.code` registry; `_meta.swiggy.deprecation` response field; hosted Food widget iframe layer; custom widget theming; OAuth 2.1 Dynamic Client Registration (RFC 7591).
- **v1.2** - Instamart + Dineout widgets.
- **v2** - URL-based major-version pinning; online-payment support on Food.

## Tracking upstream

Items we're watching but can't put a version on, because they depend on
external standards work we don't control:

- **Signed client manifests** - candidate once the MCP spec around
  manifest signing stabilises upstream. Expect this to land in a
  later v1.x or v2 once the wire format is settled.

Dates are announced when work starts; we don't pre-commit.
