import type {Request, Response} from '@gravity-ui/expresskit';
import axios from 'axios';

import {AuthClient, SsoError} from './auth-client';
import type {SsoConfig} from './config';

export class SsoService {
    readonly config: SsoConfig;
    private readonly auth: AuthClient;

    constructor(config: SsoConfig) {
        this.config = config;
        this.auth = new AuthClient(config);
    }

    preflight(req: Request, res: Response) {
        this.allowOrigin(req, res);
        if (req.get('access-control-request-method') !== 'POST') {
            throw new SsoError(405, 'METHOD_NOT_ALLOWED');
        }
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization');
        res.status(204).end();
    }

    async login(req: Request, res: Response) {
        this.allowOrigin(req, res);
        const authorization = req.get('authorization');
        if (!authorization || authorization.length > 8192 || !/^Bearer \S+$/i.test(authorization)) {
            throw new SsoError(401, 'BEARER_REQUIRED');
        }
        await this.verifyHost(authorization);
        await this.auth.signIn(res);
        res.status(204).end();
    }

    fail(req: Request, res: Response, error: unknown) {
        const failure = error instanceof SsoError ? error : new SsoError(503, 'AUTH_SERVICE_ERROR');
        req.ctx.log('SSO_LOGIN_DENIED', {code: failure.code});
        res.setHeader('Cache-Control', 'no-store');
        res.status(failure.status).send({code: failure.code});
    }

    private allowOrigin(req: Request, res: Response) {
        res.setHeader('Cache-Control', 'no-store');
        res.vary('Origin');
        const requestOrigin = req.get('origin');
        if (
            !requestOrigin ||
            !(this.config.hostOrigins || [this.config.hostOrigin]).includes(requestOrigin)
        ) {
            throw new SsoError(403, 'ORIGIN_INVALID');
        }
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    private async verifyHost(authorization: string) {
        let data: unknown;
        try {
            const result = await axios.post(
                this.config.verificationUrl,
                {},
                {
                    headers: {Authorization: authorization},
                    timeout: 2000,
                    maxRedirects: 0,
                    validateStatus: (status) => status === 200,
                },
            );
            data = result.data;
        } catch (error) {
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            if (status === 401 || status === 403) {
                throw new SsoError(status, 'HOST_DENIED');
            }
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
}
