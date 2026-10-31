# Second UI with existing DataLens services

This UI can run alongside an older UI while using the same auth, US, data API,
control API and stored content. The compatibility options below apply only to
the new UI service; existing services do not need these options.

## Native auth and cookie isolation

The SSO client accepts native auth 0.21 access tokens, which omit the `type`
claim. Both legacy and newer user tokens must have a valid PS256 signature,
expiry, the configured shared user ID, a nonempty session ID and known DataLens
roles. An explicit token type other than `user` is rejected.

Set `SSO_COOKIE_PREFIX=ahmad_preview_` on the new UI when both UIs use the same
hostname on different ports. Ports do not isolate browser cookies. The new UI
accepts only its prefixed auth cookies and translates them to canonical `auth`
and `auth_exp` names for the unchanged auth service. Responses from SSO, native
sign-in, refresh and logout use the prefixed names, host-only scope, Secure,
SameSite=Strict and HttpOnly on the token cookie. The browser reads the matching
prefixed expiry cookie. Keep `AUTH_COOKIE_NAME` unset for auth 0.21.

Without `SSO_COOKIE_PREFIX`, existing cookie behavior is unchanged. Prefixing
does not invalidate sessions or change account permissions in the auth service.

## Parent origins

`SSO_HOST_ORIGINS` accepts a comma-separated list of exact HTTPS origins, for
example `https://app.example.com:8443,https://preview.example.com:8443`.
`SSO_HOST_ORIGIN` remains supported and is combined with the list if provided.
SSO CORS echoes only a matching origin, and the UI frame policy permits the
configured parents. The frontend should select a BI origin on the same site as
its current parent; an IP parent and a domain-based BI URL are different sites.

## Optional tenant settings in older US

US 0.358 does not provide `GET /private/tenants/common/details`. Newer UI HTML
routes request this endpoint for an optional default color palette override.
For this older US, set `US_TENANT_SETTINGS_404_FALLBACK=true` on the new UI.

With this option, only an HTTP 404 from tenant metadata resolution falls back to
the ordinary palette default. Authentication errors, server errors, timeouts
and malformed successful responses keep their existing failure behavior. The
option is off by default, preserving the normal behavior of supported US
versions. It does not bypass user or content authorization.

The fork's Public link and Embed controls are disabled in production for this
build because they require additional US APIs. Full authenticated UI access
continues to use the selected account's existing permissions.
