import type {Response} from '@gravity-ui/expresskit';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import setCookieParser from 'set-cookie-parser';

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

export interface AuthSession {
    sessionId: string;
    userId: string;
    accessToken: string;
    refreshToken?: string;
    exp: number;
}

export class AuthClient {
    private readonly config: SsoConfig;

    constructor(config: SsoConfig) {
        this.config = config;
    }

    parseCookie(cookie: string | undefined, allowExpired = true, machine = false): AuthSession {
        try {
            const {accessToken, refreshToken} = JSON.parse(cookie || '');
            const access = jwt.verify(accessToken, this.config.authPublicKey, {
                algorithms: ['PS256'],
                ignoreExpiration: allowExpired,
            });
            if (
                typeof access === 'string' ||
                (!machine && access.type !== 'user') ||
                typeof access.sessionId !== 'string' ||
                typeof access.userId !== 'string' ||
                !Number.isFinite(access.exp) ||
                !Number.isFinite(access.iat)
            ) {
                throw new Error('Invalid access claims');
            }
            if (refreshToken !== undefined) {
                const refresh = jwt.verify(refreshToken, this.config.authPublicKey, {
                    algorithms: ['PS256'],
                });
                if (
                    typeof refresh === 'string' ||
                    refresh.sessionId !== access.sessionId ||
                    refresh.userId !== access.userId ||
                    typeof refresh.refreshTokenId !== 'string'
                ) {
                    throw new Error('Mismatched refresh token');
                }
            }
            return {
                sessionId: access.sessionId,
                userId: access.userId,
                accessToken,
                refreshToken,
                exp: access.exp!,
            };
        } catch {
            throw new SsoError(401, 'SESSION_INVALID');
        }
    }

    async request(
        action: 'signin' | 'signup' | 'refresh' | 'logout',
        body?: unknown,
        session?: AuthSession,
    ) {
        try {
            return await axios.request({
                url: `${this.config.authEndpoint}/${action}`,
                method: action === 'logout' ? 'GET' : 'POST',
                data: body,
                headers: {
                    Origin: this.config.biOrigin,
                    ...(session
                        ? {
                              Cookie: `${this.config.cookieName}=${encodeURIComponent(
                                  JSON.stringify({
                                      accessToken: session.accessToken,
                                      refreshToken: session.refreshToken,
                                  }),
                              )}`,
                          }
                        : {}),
                },
                timeout: 5000,
                maxRedirects: 0,
            });
        } catch (error) {
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            throw new SsoError(status && status < 500 ? 401 : 503, 'AUTH_SERVICE_ERROR');
        }
    }

    readResponse(headers: string[] | undefined): AuthSession {
        const cookie = setCookieParser
            .parse(headers || [])
            .find((item) => item.name === this.config.cookieName);
        const session = this.parseCookie(cookie?.value, false);
        if (!session.refreshToken) {
            throw new SsoError(503, 'AUTH_SERVICE_ERROR');
        }
        return session;
    }

    setCookies(res: Response, session: AuthSession) {
        const options = {
            secure: true,
            sameSite: 'strict' as const,
            path: '/',
            maxAge: 10 * 86400 * 1000,
        };
        res.cookie(
            this.config.cookieName,
            JSON.stringify({
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
            }),
            {...options, httpOnly: true},
        );
        res.cookie(`${this.config.cookieName}_exp`, String(session.exp), {
            ...options,
            httpOnly: false,
        });
    }

    clearCookies(res: Response) {
        const options = {secure: true, sameSite: 'strict' as const, path: '/'};
        res.clearCookie(this.config.cookieName, {...options, httpOnly: true});
        res.clearCookie(`${this.config.cookieName}_exp`, options);
    }
}
