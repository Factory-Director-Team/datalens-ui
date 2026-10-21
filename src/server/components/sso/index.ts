import type {NextFunction, Request, Response} from '@gravity-ui/expresskit';
import {AuthPolicy} from '@gravity-ui/expresskit';

import type {ExtendedAppRouteDescription} from '../../types/controllers';

import {loadSsoConfig} from './config';
import {sendSsoPage} from './pages';
import {SsoService} from './service';

let initialized = false;
let service: SsoService | undefined;

export function getSsoService() {
    if (!initialized) {
        const config = loadSsoConfig();
        service = config ? new SsoService(config) : undefined;
        initialized = true;
    }
    return service;
}

/** Auth gateway actions have AuthPolicy.disabled, so handle them before the ordinary gateway. */
export async function ssoBeforeAuth(req: Request, res: Response, next: NextFunction) {
    const sso = getSsoService();
    if (!sso) {
        next();
        return;
    }
    try {
        if (req.params.scope === 'auth') {
            if (req.params.service !== 'auth') {
                res.status(404).send({code: 'UNKNOWN_AUTH_SERVICE'});
                return;
            }
            await sso.gateway(req, res);
            return;
        }
        // The public SSO-enabled BFF cannot expose upstream's unauthenticated transfer ingress.
        // Backend-to-backend traffic uses the separate, private ui-api deployment.
        if (req.path.startsWith('/api/internal/')) {
            await sso.authorize(req, res);
        }
        next();
    } catch (error) {
        sso.fail(req, res, error);
    }
}

export function getSsoRoutes(): Record<string, ExtendedAppRouteDescription> {
    const sso = getSsoService();
    if (!sso) {
        return {};
    }
    const route = (
        path: ExtendedAppRouteDescription['route'],
        handler: (req: Request, res: Response) => Promise<void> | void,
    ): ExtendedAppRouteDescription => ({
        route: path,
        authPolicy: AuthPolicy.disabled,
        beforeAuth: [],
        afterAuth: [],
        handler: async (req, res) => {
            try {
                await handler(req, res);
            } catch (error) {
                sso.fail(req, res, error, true);
            }
        },
    });
    return {
        ssoBootstrap: route('GET /sso/bootstrap', (req, res) => sso.bootstrap(req, res)),
        ssoCallback: route('POST /sso/callback', (req, res) => sso.callback(req, res)),
        ssoSignedOut: route('GET /sso/signed-out', (_req, res) =>
            sendSsoPage(res, sso.config, 200, 'SIGNED_OUT'),
        ),
    };
}
