import type {Response} from '@gravity-ui/expresskit';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import setCookieParser from 'set-cookie-parser';

import {UserRole} from '../../../shared/components/auth/constants/role';

import type {SsoConfig} from './config';

export class SsoError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

export class AuthClient {
    private readonly config: SsoConfig;

    constructor(config: SsoConfig) {
        this.config = config;
    }

    async signIn(res: Response) {
        try {
            const result = await axios.post(
                `${this.config.authEndpoint}/signin`,
                {
                    login: this.config.sharedLogin,
                    password: this.config.sharedPassword,
                },
                {headers: {Origin: this.config.biOrigin}, timeout: 5000, maxRedirects: 0},
            );
            const cookie = setCookieParser
                .parse(result.headers['set-cookie'] || [])
                .find((item) => item.name === this.config.cookieName);
            const {accessToken, refreshToken} = JSON.parse(cookie?.value || '');
            const access = jwt.verify(accessToken, this.config.authPublicKey, {
                algorithms: ['PS256'],
            });
            // Native auth 0.21 issues user tokens without a type claim.
            if (
                typeof access === 'string' ||
                (access.type !== undefined && access.type !== 'user') ||
                access.userId !== this.config.sharedUserId ||
                typeof access.sessionId !== 'string' ||
                !access.sessionId.trim() ||
                !Array.isArray(access.roles) ||
                !access.roles.every((role) => Object.values(UserRole).includes(role)) ||
                !Number.isFinite(access.exp) ||
                typeof refreshToken !== 'string' ||
                !refreshToken
            ) {
                throw new Error('Invalid auth response');
            }
            // Keep the auth service's lifetime; only normalise the cookie security attributes.
            const options = {
                secure: true,
                sameSite: 'strict' as const,
                path: '/',
                ...(cookie?.maxAge !== undefined ? {maxAge: cookie.maxAge * 1000} : {}),
                ...(cookie?.expires ? {expires: cookie.expires} : {}),
            };
            res.cookie(this.config.cookieName, JSON.stringify({accessToken, refreshToken}), {
                ...options,
                httpOnly: true,
            });
            res.cookie(`${this.config.cookieName}_exp`, String(access.exp), {
                ...options,
                httpOnly: false,
            });
        } catch {
            // Upstream errors may contain the shared password or tokens; never expose/log them.
            throw new SsoError(503, 'AUTH_SERVICE_ERROR');
        }
    }
}
