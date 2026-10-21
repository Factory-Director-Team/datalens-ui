import {createHash, randomBytes, timingSafeEqual} from 'crypto';

import type {Request, Response} from '@gravity-ui/expresskit';
import axios from 'axios';
import jwt from 'jsonwebtoken';

import {AuthClient, SsoError} from './auth-client';
import type {AuthSession} from './auth-client';
import type {SsoConfig} from './config';
import {framePolicy, sendSsoPage} from './pages';
import {SsoStore} from './store';
import type {SessionBinding} from './store';

const randomId = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const isId = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
const transactionCookie = (id: string) => `__Host-dl-sso-${id}`;

export class SsoService {
    readonly config: SsoConfig;
    private readonly auth: AuthClient;
    private readonly store: SsoStore;

    constructor(config: SsoConfig) {
        this.config = config;
        this.auth = new AuthClient(config);
        this.store = new SsoStore(config.redisUrl);
    }

    requireOrigin(req: Request, expected = this.config.biOrigin) {
        if (req.get('origin') !== expected) {
            throw new SsoError(403, 'ORIGIN_INVALID');
        }
    }

    async authorize(req: Request, res: Response): Promise<void> {
        framePolicy(res, this.config);
        const session = this.session(req);
        if (this.hasMachineCredential(req) && session.userId === this.config.machineUserId) {
            this.session(req, false);
            res.locals.ssoMachine = true;
            return;
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            this.requireOrigin(req);
        }
        const binding = await this.storage(this.store.get(session.sessionId));
        if (
            !binding ||
            binding.revoked ||
            binding.expiresAt <= Date.now() ||
            binding.userId !== session.userId
        ) {
            throw new SsoError(401, 'SESSION_INVALID');
        }
        if (binding.kind === 'sso') {
            if (!binding.hostSessionId || binding.issuer !== this.config.issuer) {
                throw new SsoError(401, 'SESSION_INVALID');
            }
            try {
                await this.verifyHost(binding.hostSessionId);
            } catch (error) {
                if (error instanceof SsoError && error.code === 'HOST_DENIED') {
                    await this.storage(this.store.revoke(session.sessionId));
                }
                throw error;
            }
        } else if (binding.kind !== 'native') {
            throw new SsoError(401, 'SESSION_INVALID');
        }
        res.locals.ssoSession = binding.kind === 'sso';
    }

    async bootstrap(_req: Request, res: Response) {
        const id = randomId();
        const browser = randomId();
        const nonce = randomId();
        await this.storage(this.store.createTransaction(id, {browserHash: digest(browser), nonce}));
        res.cookie(transactionCookie(id), browser, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/',
            maxAge: 120_000,
        });
        sendSsoPage(res, this.config, 200, 'BOOTSTRAP', {transaction_id: id, nonce});
    }

    async callback(req: Request, res: Response) {
        this.requireOrigin(req, this.config.hostOrigin);
        const ticket = req.body?.ticket;
        let hostSessionId: string;
        let transactionId: string;
        let ticketId: string;
        let nonce: string;
        try {
            if (typeof ticket !== 'string' || ticket.length > 8192) {
                throw new Error('Invalid ticket');
            }
            const verified = jwt.verify(ticket, this.config.ticketPublicKey, {
                algorithms: ['RS256'],
                issuer: this.config.issuer,
                audience: this.config.audience,
                complete: true,
            });
            const claims = verified.payload;
            const now = Math.floor(Date.now() / 1000);
            if (
                verified.header.typ !== 'datalens-sso+jwt' ||
                typeof claims === 'string' ||
                claims.iss !== this.config.issuer ||
                claims.aud !== this.config.audience ||
                !isId(claims.transaction_id) ||
                !isId(claims.nonce) ||
                !isId(claims.jti) ||
                typeof claims.host_sid !== 'string' ||
                !claims.host_sid ||
                claims.host_sid.length > 256 ||
                !Number.isInteger(claims.iat) ||
                !Number.isInteger(claims.exp) ||
                claims.iat! > now ||
                claims.exp! - claims.iat! > 60 ||
                claims.exp! <= claims.iat!
            ) {
                throw new Error('Invalid ticket claims');
            }
            hostSessionId = claims.host_sid;
            transactionId = claims.transaction_id;
            ticketId = claims.jti;
            nonce = claims.nonce;
        } catch {
            throw new SsoError(403, 'TICKET_INVALID');
        }
        const browser = req.cookies[transactionCookie(transactionId)];
        if (
            !isId(browser) ||
            !(await this.storage(
                this.store.consumeTransaction(
                    transactionId,
                    {browserHash: digest(browser), nonce},
                    ticketId,
                ),
            ))
        ) {
            throw new SsoError(403, 'TICKET_INVALID');
        }
        res.clearCookie(transactionCookie(transactionId), {
            secure: true,
            httpOnly: true,
            sameSite: 'strict',
            path: '/',
        });
        await this.verifyHost(hostSessionId);
        const result = await this.auth.request('signin', {
            login: this.config.sharedLogin,
            password: this.config.sharedPassword,
        });
        const session = this.auth.readResponse(result.headers['set-cookie']);
        await this.register(
            req,
            session,
            {
                kind: 'sso',
                userId: session.userId,
                hostSessionId,
                issuer: this.config.issuer,
            },
            this.config.sharedUserId,
        );
        this.auth.setCookies(res, session);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.redirect(303, '/');
    }

    async refresh(req: Request, res: Response): Promise<AuthSession> {
        const previous = this.session(req);
        if (!previous.refreshToken) {
            throw new SsoError(401, 'SESSION_INVALID');
        }
        const result = await this.auth.request('refresh', undefined, previous);
        const current = this.auth.readResponse(result.headers['set-cookie']);
        if (current.sessionId !== previous.sessionId || current.userId !== previous.userId) {
            throw new SsoError(401, 'SESSION_INVALID');
        }
        this.auth.setCookies(res, current);
        return current;
    }

    async gateway(req: Request, res: Response) {
        this.requireOrigin(req);
        const action = req.params.action;
        res.setHeader('Cache-Control', 'no-store');
        if (action === 'signin' || action === 'signup') {
            if (action === 'signup' && req.ctx.config.authSignupDisabled) {
                throw new SsoError(403, 'SIGNUP_DISABLED');
            }
            const result = await this.auth.request(action, req.body);
            const session = this.auth.readResponse(result.headers['set-cookie']);
            await this.register(req, session, {kind: 'native', userId: session.userId});
            this.auth.setCookies(res, session);
            res.status(200).send(result.data);
        } else if (action === 'refreshTokens') {
            await this.authorize(req, res);
            await this.refresh(req, res);
            res.status(200).send({});
        } else if (action === 'logout') {
            let session: AuthSession | undefined;
            let wasSso = false;
            try {
                session = this.session(req);
            } catch {
                // An invalid cookie can always be cleared, but never used to revoke another session.
            }
            if (session) {
                const binding = await this.storage(this.store.get(session.sessionId));
                wasSso = binding?.kind === 'sso';
                await this.storage(this.store.revoke(session.sessionId));
                try {
                    await this.auth.request('logout', undefined, session);
                } catch {
                    req.ctx.logError('SSO_SESSION_CLEANUP_FAILED');
                }
            }
            this.auth.clearCookies(res);
            res.status(200).send({sso: wasSso});
        } else {
            res.status(404).send({code: 'UNKNOWN_AUTH_ACTION'});
        }
    }

    fail(req: Request, res: Response, error: unknown, page = false) {
        const failure =
            error instanceof SsoError ? error : new SsoError(503, 'VERIFICATION_UNAVAILABLE');
        req.ctx.log('SSO_REQUEST_DENIED', {code: failure.code});
        res.setHeader('Cache-Control', 'no-store');
        if (page || req.routeInfo.ui) {
            sendSsoPage(res, this.config, failure.status, failure.code);
        } else {
            res.status(failure.status).send({code: failure.code, message: failure.code});
        }
    }

    private async storage<T>(operation: Promise<T>): Promise<T> {
        let timer: NodeJS.Timeout | undefined;
        try {
            return await Promise.race([
                operation,
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(() => reject(new Error('Storage timeout')), 2000);
                }),
            ]);
        } catch {
            throw new SsoError(503, 'VERIFICATION_UNAVAILABLE');
        } finally {
            clearTimeout(timer);
        }
    }

    private session(req: Request, allowExpired = true) {
        return this.auth.parseCookie(
            req.cookies[this.config.cookieName],
            allowExpired,
            this.hasMachineCredential(req),
        );
    }

    private async verifyHost(hostSessionId: string) {
        let data: unknown;
        try {
            const result = await axios.post(
                this.config.verificationUrl,
                {host_sid: hostSessionId},
                {
                    headers: {Authorization: `Bearer ${this.config.serviceToken}`},
                    timeout: 2000,
                    maxRedirects: 0,
                },
            );
            data = result.data;
        } catch {
            throw new SsoError(503, 'VERIFICATION_UNAVAILABLE');
        }
        if (
            !data ||
            typeof data !== 'object' ||
            !('active' in data) ||
            !('datalens_access' in data) ||
            typeof data.active !== 'boolean' ||
            typeof data.datalens_access !== 'boolean'
        ) {
            throw new SsoError(503, 'VERIFICATION_UNAVAILABLE');
        }
        if (!data.active || !data.datalens_access) {
            throw new SsoError(403, 'HOST_DENIED');
        }
    }

    private hasMachineCredential(req: Request) {
        const credential = req.get('x-datalens-machine-token');
        const expected = this.config.machineToken;
        if (
            !credential ||
            !expected ||
            req.get('origin') ||
            req.get('sec-fetch-site') ||
            req.routeInfo.ui
        ) {
            return false;
        }
        return timingSafeEqual(Buffer.from(digest(credential)), Buffer.from(digest(expected)));
    }

    private async register(
        req: Request,
        session: AuthSession,
        binding: Omit<SessionBinding, 'expiresAt'>,
        expectedUserId?: string,
    ) {
        try {
            if (expectedUserId && session.userId !== expectedUserId) {
                throw new SsoError(503, 'AUTH_SERVICE_ERROR');
            }
            await this.storage(this.store.register(session.sessionId, binding));
        } catch (error) {
            try {
                await this.auth.request('logout', undefined, session);
            } catch {
                req.ctx.logError('SSO_SESSION_CLEANUP_FAILED');
            }
            throw error;
        }
    }
}
