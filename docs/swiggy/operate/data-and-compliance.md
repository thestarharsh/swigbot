# Data & compliance

> DPDP 2023 posture, data residency, consent, no-PII stance, certifications.

## Regulatory posture

| Framework | Status |
| --- | --- |
| **DPDP Act, 2023** (India) | Compliant. Swiggy is the **Data Fiduciary**; the MCP layer exposes only data already covered by Swiggy's existing consent framework. |
| **IT Rules (India), 2011** (Sensitive Personal Data) | Compliant. |
| **GDPR** | Best-effort for EU users - not a primary target market. Mail [builders@swiggy.in](mailto:builders@swiggy.in) if you need a GDPR DPA. |
| **CCPA/CPRA** | Same as GDPR - best-effort. |

## Who is the Data Fiduciary

Under DPDP 2023, Swiggy is the **Data Fiduciary** for all user data accessed through MCP. Your integration acts as a **Data Processor** operating within the scope Swiggy permits.

What that means in practice:

- Users consent to Swiggy's processing of their data when they sign up for Swiggy; the MCP layer does **not** expand that consent scope.
- Your integration can only use Swiggy-originated data to serve the user's immediate task (e.g. placing an order). Analytics, training data, ad targeting require **separate, explicit consent** on your side.
- Any data-subject request (access, correction, erasure) concerning Swiggy-originated data is handled through the Swiggy app - direct users there.

## Data residency

| Concern | Region |
| --- | --- |
| Primary compute | AWS Mumbai (`ap-south-1`) |
| Primary data stores | India |
| Secondary / failover | AWS Singapore (`ap-southeast-1`) - active-passive |
| User-facing traffic | India-edge CDN |

No user data leaves the India/Singapore region boundary. Swiggy does **not** route MCP requests through US or EU regions.

If **your** platform processes MCP responses outside India (e.g. your LLM inference runs in US-East), you must:

1. Have a signed Data Processing Agreement with Swiggy before production.
2. Maintain Standard Contractual Clauses (SCCs) or equivalent cross-border transfer mechanisms.
3. Minimize fields crossing the border - summarise locally when possible, don't ship full order history to inference.

Mail [builders@swiggy.in](mailto:builders@swiggy.in) for a template DPA.

## What flows through tool calls

A tool call may carry:

- User identifiers (opaque to you; no raw phone / email / name returned by tools).
- Tool arguments - addresses, cart items, coupon codes.
- Tool responses - restaurant data, menu items, order status, delivery partner info.

Treat **all** of this as PII under DPDP. Audit your logging accordingly.

## What you must do

If you store or process Swiggy tool responses on your side:

1. **Do not persist user PII longer than needed** to serve the current session - unless you have your own lawful basis and user consent.
2. **Do not use Swiggy-originated data for analytics, advertising, or model training** without explicit user consent and a DPA.
3. **Log only what you need for debugging**. Store the session id (for correlation with Swiggy-side logs), not full request/response bodies in plaintext.
4. **Honour deletion requests** - if a user deletes their Swiggy account or requests deletion from you, any derived data on your side must also be deleted.
5. **Hash user identifiers at rest** unless a specific lawful basis requires plaintext.

## Encryption

- **In transit**: TLS 1.2+ everywhere (HSTS enforced).
- **At rest**: AES-256 on all persistent stores.
- **Tokens**: signed JWT with short lifetimes.

## Audit logs

Every tool call produces an audit log entry on Swiggy's side keyed by session id. Retained 90 days. Available on lawful request (DPA / subpoena / regulatory order).

## Data subject rights

Swiggy honours DPDP-mandated rights directly through the Swiggy app:

- **Access** - users request a copy of their data in-app.
- **Correction** - users update profile, addresses, preferences.
- **Erasure** - deleting the Swiggy account deletes associated MCP-accessible data within 30 days.

If you receive a DSR on your side involving Swiggy-originated data, direct the user to the Swiggy app. Coordinate with [builders@swiggy.in](mailto:builders@swiggy.in) if the request is complex.

## Certifications

Available on request under NDA:

- SOC 2 Type II report (Swiggy's underlying infrastructure).
- ISO 27001 certification.
- PCI DSS for payment-adjacent systems. (MCP itself doesn't touch card data; order flows resolve to Swiggy's own checkout.)

## Security contact

Security issues go to [security@swiggy.in](mailto:security@swiggy.in), not builders. Standard responsible-disclosure window: 90 days.

## Signed manifests (roadmap)

The MCP ecosystem is converging on a signed-manifest pattern to attest tool integrity. We'll adopt it once the spec stabilises (targeting v1.2). Until then:

- Tool schemas are published on this site (see [reference](/docs/reference.md)) and are auto-generated from source - no human drift.
- Any schema mismatch in your client should be treated as a security-relevant event; report to [security@swiggy.in](mailto:security@swiggy.in).
