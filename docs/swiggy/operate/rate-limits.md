# Rate limits

> How Swiggy MCP handles abusive traffic today, the quotas we plan to advertise, and how to request a larger allocation.

## Status today

Rate limiting is **not enforced at the MCP layer in v1.0**. Abusive traffic is shed upstream (at Swiggy's ingress and core services), not by the MCP server itself. That means:

- You will not see `429 Too Many Requests` from a Swiggy MCP endpoint today.
- You will not see `X-RateLimit-*` response headers today.
- If upstream sheds your traffic, the tool call surfaces as an `UPSTREAM_ERROR`-class failure (see [errors](/docs/reference/errors.md)) - retry with exponential backoff.

If you're building for production traffic that will exceed the planned quotas below, email [builders@swiggy.in](mailto:builders@swiggy.in) **before** you launch so we can negotiate a custom ceiling and keep you off the upstream shedder.

## Planned quotas (v1.x developer tier)

These are the ceilings we'll advertise once MCP-layer rate limiting ships. They are **guidance, not enforcement**, today.

| Scope | Planned limit |
| --- | --- |
| Per authenticated user, per server | 120 requests / minute |
| Per authenticated user, per server (write tools) | 30 requests / minute |
| Burst (10-second window) | 2× steady-state |

Limits are keyed on the authenticated user. Enterprise integrators will get bespoke ceilings scoped at onboarding.

## Planned response contract

When MCP-layer rate limiting ships, every successful response will carry:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1720000060
```

Throttled calls will return:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 23
```

With the standard error envelope (`error.message` populated). A symbolic `error.code` of `RATE_LIMITED` will be added once the error-code registry ships - see [errors](/docs/reference/errors.md).

## How to upgrade

Mail [builders@swiggy.in](mailto:builders@swiggy.in) with:

1. Your integration name and a contact email.
2. Expected QPS (sustained and peak) with justification.
3. Surface context - voice agent, batch jobs, chat agent all have different burst shapes.

Turnaround: typically same business day once validated. Enterprise partners get bespoke ceilings written into the contract.

## Best practices (apply today)

- **Batch where possible** - one `get_addresses` per session is plenty; don't re-fetch on every turn.
- **Cache low-churn data** - saved addresses, restaurant metadata, menu images change slowly.
- **Don't poll `track_*` faster than 10s** - delivery-partner ETA updates arrive at that cadence.
- **Back off aggressively on transient upstream errors** - exponential backoff with jitter, max 5 retries.
- **Separate user activity from background jobs** - if you run nightly analytics, talk to us at onboarding so we can carve out a bespoke ceiling and keep that traffic off your interactive budget.

## Voice & ambient guidance

Voice agents and TV surfaces have different shapes than text chat:

- **Lower QPS, higher burstiness** - a user says "order food" and your agent makes 4-6 tool calls in 3 seconds.
- **Peak-hour amplification** - Indian mealtime traffic (12:00-14:00, 19:00-22:00 IST) amplifies through voice surfaces; your daily budget may be fine while your hourly peak isn't.
- **Stick to `your_go_to_items` for reorders** - one call replaces 3-5 search calls for a returning user.

Enterprise voice/ambient partners get a rate-limit profile shaped to their surface, not the developer-tier defaults.
