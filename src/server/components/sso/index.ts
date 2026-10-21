import type {Request, Response} from '@gravity-ui/expresskit';
import {AuthPolicy} from '@gravity-ui/expresskit';

import type {ExtendedAppRouteDescription} from '../../types/controllers';

import {loadSsoConfig} from './config';
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
                sso.fail(req, res, error);
            }
        },
    });
    return {
        ssoLogin: route('POST /sso/login', (req, res) => sso.login(req, res)),
        ssoPreflight: route('OPTIONS /sso/login', (req, res) => sso.preflight(req, res)),
    };
}
