# Delegated auth

> OAuth 2.1 on-behalf-of flow for multi-tenant platforms serving end users at scale.

Platform operators don't authenticate as themselves - they authenticate **on behalf of** each end user. Your user, Swiggy's account, your UI. Swiggy holds the PII; you hold the scoped session. This page is the contract.

## The principle

> **Note**
>
> Swiggy remains the data fiduciary under DPDP 2023. End users authorize Swiggy access through your product via OAuth 2.1 with PKCE. Your platform receives a per-user access token. You never see the user's Swiggy password, OTP, or raw PII beyond what tool responses return.

## The flow

```
┌────────────┐      ┌─────────────────┐     ┌────────────────┐     ┌─────────────┐
│  End user  │      │  Your platform   │     │  Swiggy OAuth  │     │  Swiggy     │
│ (voice /   │      │   (Alexa /       │     │  server        │     │  identity   │
│  chat /    │      │    Gemini /      │     │                │     │  service    │
│  in-app)   │      │    platform)     │     │                │     │             │
└─────┬──────┘      └────────┬─────────┘     └────────┬───────┘     └──────┬──────┘
      │                      │                         │                    │
      │  "Order food"        │                         │                    │
      ├─────────────────────►│                         │                    │
      │                      │  Detect: user needs     │                    │
      │                      │  Swiggy authorization   │                    │
      │                      │                         │                    │
      │  Open link / card:   │                         │                    │
      │  "Connect Swiggy"    │                         │                    │
      │◄─────────────────────┤                         │                    │
      │                      │                         │                    │
      │  /auth/authorize?                              │                    │
      │  state=...&code_challenge=...&redirect_uri=... │                    │
      ├────────────────────────────────────────────────►│                   │
      │                      │                         │  Phone + OTP       │
      │                      │                         ├───────────────────►│
      │                      │                         │◄───────────────────┤
      │  Redirect to         │                         │                    │
      │  your callback URL   │                         │                    │
      │  with authorization  │                         │                    │
      │  code                │                         │                    │
      │◄────────────────────────────────────────────────┤                   │
      │                      │                         │                    │
      │                      │  POST /auth/token       │                    │
      │                      │  + code_verifier        │                    │
      │                      ├────────────────────────►│                    │
      │                      │◄────────────────────────┤                    │
      │                      │  access_token           │                    │
      │                      │  (scoped, 5 days)       │                    │
      │                      │                         │                    │
      │                      │  Call Swiggy MCP tool   │                    │
      │                      │  on behalf of user      │                    │
      │                      │  with user's token      │                    │
      │                      ├────────────────────────►│                    │
```

## Implementation

### 1. Pre-register your platform

Your MCP client registers itself dynamically via [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) at `POST /auth/register` - there's no client identifier to apply for. At enterprise onboarding we align on:

- An allowlisted set of `redirect_uri` values (exact-match HTTPS, or platform-specific schemes like `googleassistant://`, `alexa://`, `jio-hello://`)
- Which Swiggy MCP servers your integration will call - any of `food`, `instamart`, `dineout`. Per-application server allowlists are on the roadmap; today access is scoped at the user level.

### 2. Initiate authorization per user

Generate a fresh PKCE verifier/challenge pair for each user session:

```ts

const codeVerifier = crypto.randomBytes(32).toString("base64url");
const codeChallenge = crypto
  .createHash("sha256")
  .update(codeVerifier)
  .digest("base64url");
```

Send the user to:

```
https://mcp.swiggy.com/auth/authorize?
  response_type=code&
  client_id=<from-dcr>&
  redirect_uri=<your-callback>&
  code_challenge=<challenge>&
  code_challenge_method=S256&
  state=<per-user-csrf-token>&
  scope=mcp:tools
```

The `client_id` is whatever `/auth/register` returned to your MCP client; standard MCP clients handle this transparently.

### 3. Exchange the code for a token

Your callback receives `?code=...&state=...`. Exchange:

```bash
curl -X POST https://mcp.swiggy.com/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "<code>",
    "code_verifier": "<verifier>",
    "client_id": "<from-dcr>",
    "redirect_uri": "<your-callback>"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOiJI...",
  "token_type": "Bearer",
  "expires_in": 432000,
  "scope": "mcp:tools mcp:resources mcp:prompts"
}
```

### 4. Store tokens per user

Your platform stores this access token associated with the end user, in secure per-user storage - never shared across users, never persisted in plaintext beyond its lifetime. Access tokens live 5 days; the underlying user session lasts longer, so re-auth is usually silent (no phone + OTP prompt again). Refresh-token issuance is not available in v1.0; when the access token expires, re-run the authorization flow.

### 5. Call Swiggy MCP on the user's behalf

```ts
const response = await fetch("https://mcp.swiggy.com/food", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${user.swiggyAccessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: "search_restaurants", arguments: { /* ... */ } },
    id: 1,
  }),
});
```

## Token lifecycle

| Item | Lifetime | Notes |
| --- | --- | --- |
| Access token | 5 days | Signed JWT; includes `user_id` and transaction id - scopes are not carried in the token claim set today |
| User session | 30 days idle, sliding | Silent re-auth until this expires |
| Authorization code | 120 seconds, single-use | Exchange immediately |

Tokens can be invalidated server-side before `exp` (user logs out of Swiggy app, security event, policy revoke). Treat any 401 as "re-run the authorization flow"; never cache success assumptions.

## Scopes

| Scope | Grants |
| --- | --- |
| `mcp:tools` | Call any tool on any Swiggy MCP server the authenticated user is allowed to use |
| `mcp:resources` | Read MCP resources (widget registry, static metadata) |
| `mcp:prompts` | Access server-supplied prompt templates |

v1 access control is keyed at the user level, not at the application level. Per-application server allowlists and finer-grained scopes (`food.read`, `im.write`, `dineout.read`, ...) are on the roadmap but are not enforced today - requesting them has no effect.

## Logout

When the end user disconnects Swiggy from your product:

```bash
curl -X POST https://mcp.swiggy.com/auth/logout \
  -H "Authorization: Bearer <user-access-token>"
```

This revokes the session on Swiggy's side. Drop the token from your storage.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| 401 on every call | Token expired | Re-run authorization; silent if session still valid |
| 419 | Session revoked | Full re-auth (phone + OTP) |
| 403 | Scope missing | Re-auth with broader scope |
| Upstream shedding | Unexpected traffic spike | Back off; negotiate capacity per [rate-limits](/docs/operate/rate-limits.md) |
| Stuck on `/authorize` | Bad `redirect_uri` | Must exact-match an allowlisted URI |

## What we commit to

- **PII stays with Swiggy**. Tool responses return only what the user authorized for your scope.
- **Audit logs are available** to you per-user, on lawful request - see [data-and-compliance](/docs/operate/data-and-compliance.md).
- **Token issuance is instrumented** on our side; if you see anomalies on your side, [builders@swiggy.in](mailto:builders@swiggy.in) can correlate.
