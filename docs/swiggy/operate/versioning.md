# Versioning

> SemVer commitment, deprecation window, how we announce breaking changes.

## SemVer commitment

Swiggy MCP follows **semantic versioning** at the server level:

- **MAJOR** (`2.0.0`) - backwards-incompatible change. Minimum **6-month deprecation window**.
- **MINOR** (`1.1.0`) - backwards-compatible new capability. Safe to adopt immediately.
- **PATCH** (`1.0.1`) - bug fixes, no schema change.

The current server version is announced in the MCP `initialize` response under `implementation.version`.

## What counts as breaking

These require a major bump + deprecation notice:

- Removing a tool.
- Renaming a tool.
- Removing a required parameter.
- Adding a new required parameter.
- Changing a response field's type.
- Removing a response field.

These are **non-breaking** and ship without a major bump:

- Adding a new tool.
- Adding a new optional parameter.
- Adding a new response field.
- Adding a new OAuth scope.
- Widening a parameter's accepted range (e.g. string enum gaining a value).
- Adding a new `error.code` - your client should handle unknown codes as generic failures.

## Deprecation window

From announcement to removal: **minimum 6 months**.

```
Day 0    Announcement. New behaviour ships alongside old.
Day 90   Old behaviour emits a deprecation warning in response metadata.
Day 150  Escalated reminder emailed to integrators.
Day 180  Old behaviour removed.
```

When the deprecation-metadata pipeline ships (planned for v1.1), warnings will appear in the JSON-RPC `_meta` field:

```json
{
  "_meta": {
    "swiggy.deprecation": {
      "tool": "old_tool_name",
      "replaced_by": "new_tool_name",
      "remove_after": "2026-10-01"
    }
  }
}
```

This field is **not emitted in v1.0** - until it ships, deprecation notices flow through email and the [changelog](/docs/operate/changelog.md). You can wire up the `_meta` instrumentation ahead of time; it will begin populating once v1.1 rolls out.

## How we announce

1. **Email** to your designated engineering contact (at least 7 days before the public announcement).
2. **Blog post** at [/blog](/blog) tagged `breaking` and `deprecation`.
3. **Changelog entry** with a ⚠ flag ([changelog](/docs/operate/changelog.md)).
4. **Deprecation metadata** in responses (above).

## What you must do

- Subscribe your engineering alias to announcements - mail [builders@swiggy.in](mailto:builders@swiggy.in) with the address to add.
- Pre-wire alerting for the `_meta.swiggy.deprecation` field so you're ready when v1.1 ships it; until then, watch email and the changelog.
- Plan migrations to complete well before the 180-day cutoff.

## Parallel major versions (roadmap)

v1 runs a single major server version. v1.1 adds URL-based version pinning:

```
https://mcp.swiggy.com/v2/food   - latest major
https://mcp.swiggy.com/v1/food   - pinned during your migration
```

The default URL without the `vN` segment always points at latest.

## Experimental features

From time to time we'll ship **experimental** tools or parameters. These are documented in [reference](/docs/reference.md) with an `experimental` tag. They can change or disappear without the 6-month deprecation window. Use them when you want the capability early; plan for churn.
