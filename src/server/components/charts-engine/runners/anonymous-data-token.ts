import type {AppContext} from '@gravity-ui/nodekit';
import jwt from 'jsonwebtoken';
import NodeCache from 'node-cache';

// Identity carried by an anonymous public-link / embed data query. Under AUTH_TYPE=NATIVE, data-api's
// auth middleware only needs a valid PS256 JWT with a non-empty `userId` (+ `exp`) — it uses `userId`
// solely as the auth subject and the RLS subject, not to select connection credentials (those come
// from the stored connection). The opensource US authorizes any validly-signed token for reads, so we
// grant no role (roles gate writes in US) — this is a read-only, least-privilege subject.
const ANONYMOUS_USER_ID = 'anonymous';

const CACHE = new NodeCache();
const CACHE_KEY = 'anonymousDataApiToken';
const CACHE_TTL_SECONDS = 300; // 5 minutes — mirrors createAuthArgsMiddleware
const JWT_EXPIRATION_SECONDS = 3600; // 1 hour

// Mints (and caches) the short-lived service JWT the BFF attaches as `Authorization: Bearer` on the
// anonymous public/embed data query, so data-api (NATIVE auth) accepts it. Signed with the platform
// auth private key (PS256); the public half is data-api's `AUTH__JWT_KEY`. The token is minted
// server-side and never returned to the anonymous client (it rides only on the outbound data-api
// subrequest), same posture as the US master token.
//
// Returns `undefined` when no signing key is configured — the data path then behaves as before
// (data-api 401s the anonymous query), so the operator enables anonymous data by supplying the key.
export function getAnonymousDataApiToken(ctx: AppContext): string | undefined {
    const privateKey = ctx.config.authTokenPrivateKey;
    if (!privateKey) {
        return undefined;
    }

    let token = CACHE.get<string>(CACHE_KEY);
    if (!token) {
        const now = Math.floor(Date.now() / 1000);
        token = jwt.sign(
            {
                userId: ANONYMOUS_USER_ID,
                iat: now,
                exp: now + JWT_EXPIRATION_SECONDS,
            },
            privateKey,
            {algorithm: 'PS256'},
        );
        CACHE.set(CACHE_KEY, token, CACHE_TTL_SECONDS);
    }

    return token;
}
