# Whole-application iframe SSO

This opt-in integration signs in through an **existing shared local DataLens account**. Each handoff creates a separate real auth session. The host and DataLens must use sibling HTTPS origins of one site, for example `https://app.example.com` and `https://bi.example.com`. All ancestors must remain same-site. Ordinary DataLens credential login/logout remains available, including during a host outage.

## Configure the BFF

Set `AUTH_ENABLED=true`, `SSO_ENABLED=true`, and the following variables. Every value also accepts a `_FILE` alternative for mounted secrets. Leave SSO disabled until the host endpoints, durable registry and ingress are configured.

| Variable                                                        | Meaning                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SSO_HOST_ORIGIN`                                               | Exact HTTPS parent origin, without a trailing slash                                            |
| `SSO_BI_ORIGIN`                                                 | Exact HTTPS DataLens origin                                                                    |
| `SSO_TICKET_ISSUER`, `SSO_TICKET_AUDIENCE`                      | Exact ticket issuer and audience                                                               |
| `SSO_TICKET_PUBLIC_KEY`                                         | Dedicated RSA public key for RS256 host tickets; never the DataLens platform key               |
| `SSO_VERIFICATION_URL`                                          | Fixed host verification endpoint; use HTTPS or a private authenticated service network         |
| `SSO_SERVICE_TOKEN`                                             | Separate BFF-to-host service credential                                                        |
| `SSO_SHARED_LOGIN`, `SSO_SHARED_PASSWORD`, `SSO_SHARED_USER_ID` | Existing local full-rights account and its encoded DataLens user ID                            |
| `SSO_REDIS_URL`                                                 | Dedicated durable Redis primary, shared by every BFF replica                                   |
| `SSO_MACHINE_TOKEN`, `SSO_MACHINE_USER_ID`                      | Optional separate machine credential (at least 32 characters) and permitted machine account ID |

Existing `AUTH_ENDPOINT`, `AUTH_TOKEN_PUBLIC_KEY` and optional `AUTH_COOKIE_NAME` must match the unchanged auth service. Configure auth's `UI_APP_ENDPOINT` to the BI origin and `DISABLE_WILDCARD_COOKIE=true`. The BFF normalises issued browser cookies to Secure, HttpOnly, host-only, SameSite=Strict, Path=/; the ordinary readable expiration cookie contains only the access expiry. The shared password never reaches browser code.

Redis is authoritative session storage, **not an evicting cache**. Use Redis 7 with persistent volumes, `appendonly yes`, `appendfsync always`, `maxmemory-policy noeviction`, restricted network access and backups. All reads/writes go to the same primary; do not introduce lagging read replicas or failover that can lose acknowledged writes. Session provenance is immutable and retained for 31 days, with an absolute 30-day access limit. Keep auth lifetimes at or below these documented limits, or extend registry retention before increasing them. Missing records deny access. A registry outage also blocks native sessions, while a host outage affects only SSO.

Enabling the registry requires existing browser users to sign in again. Unknown pre-rollout cookies are deliberately not classified as native. Schedule this explicit re-login during rollout. Do not clear the registry to roll back while leaving SSO credentials usable: drain/expire issued credentials or preserve the gate until they can no longer authenticate.

## Host backend contract

Implement two operations in the host's own authentication layer. The real host application is outside this repository; the Docker fixture is a reference contract, not a production authentication server.

1. **Issue a ticket**: `POST /bi/ticket`, authenticated with the host frontend's existing `Authorization: Bearer …`. Body: `transaction_id` and `nonce` from the iframe challenge. Derive `host_sid` from the verified bearer session and require `datalens_access`. Reject revoked/expired bearer credentials. Return `{ticket}` and `Cache-Control: no-store`.
2. **Verify a session**: `POST /bi/verify`, authenticated with `Authorization: Bearer <SSO_SERVICE_TOKEN>`. Body: `{host_sid}`. Return HTTP 200 with `{active: boolean, datalens_access: boolean}` from authoritative current state. An unknown/revoked session returns false, not HTTP 401; 401 is reserved for a bad service credential. After completed logout/revocation, subsequent calls must observe that change. No positive cache or lagging replica is allowed. Network errors, non-2xx and malformed responses are treated as temporary verification failures. The BFF timeout is two seconds.

Tickets use RS256, header `typ: datalens-sso+jwt`, and exact `iss`/`aud` values. Required claims: `host_sid`, `transaction_id`, `nonce`, unique `jti`, integer `iat` and `exp`. Lifetime must be positive and no more than 60 seconds, without future `iat`. Transaction/nonce/jti must use 16–128 ASCII letters, digits, underscores or hyphens. The BFF validates signature and browser binding, atomically consumes ticket/transaction across replicas, verifies the host, then calls ordinary internal credential sign-in. Failed consumption or a later failure requires a fresh handoff.

The user's host bearer is used only by the host frontend/backend. Do not send it to DataLens or store it in BI. Use separate secrets for ticket signing, session verification and the shared DataLens account. Rotate the shared password and BFF password secret together. For ticket-key rotation, drain outstanding tickets (at most 60 seconds), update the trusted key on all replicas and start issuance with the new key. Service-token rotation similarly requires coordinating both sides.

## Parent-page integration

Copy or serve `dist/public/sso-bridge.js` in the host frontend. Instantiate `DataLensSSO` with the iframe element, exact `biOrigin`, an asynchronous `getTicket(challenge)` function returning the ticket string, and an optional `onStatus(code)` callback. `getTicket` must call the host ticket operation using the application's bearer authentication. On ticket HTTP 401/403, reject with an error whose `code` is `HOST_DENIED`; on temporary backend/network failure use `VERIFICATION_UNAVAILABLE`. Other failures produce `HANDOFF_FAILED`. The helper validates exact message origin, source window, protocol version and challenge shape, then submits a form POST to the fixed BI callback targeting that iframe.

Call `open()` to enter DataLens. After explicit BI logout, the iframe shows “Вы вышли” and the helper stops. Wire the host's “Открыть DataLens” button to a fresh `open()` call. Do not automatically reopen from a status callback. Call `close()` on host logout/account/session changes; it hides the old iframe and cancels any pending handoff. Call `destroy()` on unmount. The BFF gate still enforces logout/revocation even if the parent misses the UI notification.

The helper sends no host credentials to the iframe. Tickets travel only in POST bodies. Do not add tickets to URLs or log handoff bodies. Configure the host's CSP to allow its bridge script, the BI iframe and form submission to the BI origin. Configure the reverse proxy to preserve the BFF's `frame-ancestors` policy and avoid adding a conflicting `X-Frame-Options`. Retain separate framing rules for anonymous Public link and Embed routes.

Normal authenticated iframe navigation includes the application chrome. Explicit `mode=embedded` and anonymous sharing keep their existing presentation. On one BI origin, tabs share the auth cookie; the most recent native/SSO login replaces it for other tabs. Pending handoffs have distinct transaction cookies. There are no independent native/SSO cookie jars within one browser profile.

## Protected and machine ingress

All authenticated HTML/API/data/export requests, automatic HTML refresh and direct auth-gateway refresh run through the SSO policy. Native requests use the same local registry without calling the host. Session-local logout remains available without a host check and revokes only the presented DataLens session ID. Host denial revokes the binding; temporary verification failure denies the request without permanently revoking it.

Do not publish auth, United Storage, data/control APIs or the separate `ui-api` service to browsers. The public UI's internal transfer routes also require the browser policy when SSO is enabled; keep backend-to-backend transfer traffic on the separate private `ui-api` service. The test reverse proxy blocks `/api/internal/` entirely. Inventory actual production proxy routes before rollout.

For existing MCP traffic, configure `DATALENS_BFF_MACHINE_TOKEN` in MCP to match `SSO_MACHINE_TOKEN`, and `SSO_MACHINE_USER_ID` to its configured signed identity. MCP sends this additional secret only to its BFF endpoint, together with its existing signed auth cookie. The BFF verifies both the platform signature/account and the separate credential. Browser Origin/Fetch Metadata requests and HTML routes cannot claim this exception; an unknown session ID or an arbitrary header value is insufficient. Protect the machine secret and transport like any service credential. Ordinary browser sessions never obtain it.

Host revocation stops SSO on the next protected request started after revocation completes. It cannot erase already rendered data or undo work authorised earlier. Someone who knows a valid native DataLens password can still enter directly after host revocation; this is the agreed policy. DataLens audit attribution remains the shared account.

## Docker acceptance

From the UI repository, run `bash tests/sso/run.sh`. To restrict the handoff tests to one browser, use `bash tests/sso/run.sh --project=chromium handoff.test.ts`.

The isolated Compose project builds the local UI and US sources, uses unchanged auth 0.34.0, starts two BFF replicas and durable Redis, and provides a test host backend, test-only credentials/certificates, a same-site HTTPS proxy and a Playwright runner with Chromium/Firefox/WebKit. The registry lifecycle phase always runs the full browser matrix, preserving browser state across actual BFF/Redis restart, Redis outage/recovery and loss of the disposable registry. A test-only Redis memory limit also exercises failed binding persistence after real auth sign-in. Assertions use public HTTP/browser results, without inspecting registry records. No production host or credentials are required and no internal service ports are published. Reports go to `tests/artifacts/sso`. The script removes only this test project's disposable containers/volumes on exit.

Test backend control routes and test signing keys exist only inside this stand. Never deploy the fixture as the real host. Before deployment, verify the real host's session-revocation contract and separately check actual Safari; a Docker WebKit pass alone does not validate Safari. Record actual test outcomes, including infrastructure failures, instead of counting test discovery or Compose validation as a passing browser run.
