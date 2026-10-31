import {generateKeyPairSync} from 'crypto';

import type {Response} from '@gravity-ui/expresskit';
import axios from 'axios';
import jwt from 'jsonwebtoken';

import {AuthClient} from '../auth-client';
import type {SsoConfig} from '../config';

jest.mock('axios');

const keys = generateKeyPairSync('rsa', {modulusLength: 2048});
const foreignKeys = generateKeyPairSync('rsa', {modulusLength: 2048});
const publicKey = keys.publicKey.export({type: 'spki', format: 'pem'}).toString();
const config: SsoConfig = {
    hostOrigin: 'https://app.example.com:8443',
    biOrigin: 'https://bi.example.com:8444',
    verificationUrl: 'https://backend.example.com/api/v1/bi/verify',
    sharedLogin: 'test-viewer',
    sharedPassword: 'test-only-password',
    sharedUserId: 'shared-user',
    authEndpoint: 'http://auth:8080',
    authPublicKey: publicKey,
    cookieName: 'auth',
};

function responseFor(payload: Record<string, unknown>, foreign = false) {
    const accessToken = jwt.sign(
        {
            userId: 'shared-user',
            sessionId: 'session-one',
            roles: ['datalens.viewer'],
            exp: Math.floor(Date.now() / 1000) + 900,
            ...payload,
        },
        foreign ? foreignKeys.privateKey : keys.privateKey,
        {algorithm: 'PS256'},
    );
    return {
        headers: {
            'set-cookie': [
                `auth=${encodeURIComponent(JSON.stringify({accessToken, refreshToken: 'test-refresh'}))}; Path=/; Max-Age=86400`,
            ],
        },
    };
}

test.each([undefined, 'user'])(
    'accepts a signed native access token with type %s',
    async (type) => {
        (axios.post as jest.Mock).mockResolvedValue(responseFor(type ? {type} : {}));
        const emitted: string[] = [];
        const res = {cookie: (name: string) => emitted.push(name)} as unknown as Response;
        await new AuthClient(config).signIn(res);
        expect(emitted).toEqual(['auth', 'auth_exp']);
    },
);

test.each([
    {type: 'service'},
    {userId: 'other-user'},
    {sessionId: ''},
    {roles: 'datalens.viewer'},
    {roles: ['unexpected-role']},
    {exp: Math.floor(Date.now() / 1000) - 10},
])('rejects a signed token with invalid claims %j', async (claims) => {
    (axios.post as jest.Mock).mockResolvedValue(responseFor(claims));
    const emitted: string[] = [];
    const res = {cookie: (name: string) => emitted.push(name)} as unknown as Response;
    await expect(new AuthClient(config).signIn(res)).rejects.toMatchObject({
        status: 503,
        code: 'AUTH_SERVICE_ERROR',
    });
    expect(emitted).toEqual([]);
});

test('rejects a native token signed by a different key', async () => {
    (axios.post as jest.Mock).mockResolvedValue(responseFor({}, true));
    const emitted: string[] = [];
    const res = {cookie: (name: string) => emitted.push(name)} as unknown as Response;
    await expect(new AuthClient(config).signIn(res)).rejects.toMatchObject({status: 503});
    expect(emitted).toEqual([]);
});
