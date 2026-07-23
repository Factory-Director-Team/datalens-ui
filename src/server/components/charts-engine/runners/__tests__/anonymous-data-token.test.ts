import {generateKeyPairSync} from 'crypto';

import type {AppContext} from '@gravity-ui/nodekit';
import jwt from 'jsonwebtoken';

// Ticket-01 data-api identity gap (see .scratch/public-sharing-embedding/findings/01):
// under AUTH_TYPE=NATIVE data-api rejects the anonymous public/embed data query with 401 because
// the BFF attaches no Authorization header. This helper mints the service JWT the BFF attaches so
// data-api accepts the anonymous query. data-api verifies it (PS256) against the same public key it
// is configured with (AUTH__JWT_KEY); the opensource US authorizes any validly-signed token, so the
// token carries the minimal identity data-api needs (a non-empty userId + exp) and no role.

const {privateKey, publicKey} = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {type: 'spki', format: 'pem'},
    privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
});

// Fresh module per call so the module-level token cache does not leak between cases.
function loadHelper(authTokenPrivateKey?: string) {
    let getAnonymousDataApiToken!: (ctx: AppContext) => string | undefined;
    jest.isolateModules(() => {
        getAnonymousDataApiToken = require('../anonymous-data-token').getAnonymousDataApiToken;
    });
    const ctx = {config: {authTokenPrivateKey}} as unknown as AppContext;
    return () => getAnonymousDataApiToken(ctx);
}

describe('getAnonymousDataApiToken', () => {
    test('mints a PS256 JWT data-api accepts: userId + future exp, verifiable against the public key', () => {
        const mint = loadHelper(privateKey);

        const token = mint();
        expect(token).toBeDefined();

        // data-api decodes with PS256 against AUTH__JWT_KEY (the public half) — mirror that here.
        const payload = jwt.verify(token as string, publicKey, {algorithms: ['PS256']}) as {
            userId: string;
            exp: number;
            roles?: unknown;
        };

        expect(payload.userId).toBe('anonymous');
        expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('grants no role — reads only (roles gate writes in US)', () => {
        const mint = loadHelper(privateKey);

        const payload = jwt.decode(mint() as string) as {roles?: unknown};
        expect(payload.roles).toBeUndefined();
    });

    test('returns undefined when no signing key is configured (feature not enabled by the operator)', () => {
        const mint = loadHelper(undefined);
        expect(mint()).toBeUndefined();
    });

    test('caches the minted token across calls', () => {
        const mint = loadHelper(privateKey);
        expect(mint()).toBe(mint());
    });

    test('a token minted with a foreign key is rejected by the real public key', () => {
        const foreign = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {type: 'spki', format: 'pem'},
            privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
        }).privateKey;
        const mint = loadHelper(foreign);

        expect(() => jwt.verify(mint() as string, publicKey, {algorithms: ['PS256']})).toThrow();
    });
});
