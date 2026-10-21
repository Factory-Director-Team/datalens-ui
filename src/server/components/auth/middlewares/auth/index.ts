import type {NextFunction, Request, Response} from '@gravity-ui/expresskit';

import {getSsoService} from '../../../sso';
import {framePolicy} from '../../../sso/pages';
import {onAuthLogout, onAuthSignin} from '../../callbacks';

import {apiAuth} from './api-auth';
import {uiAuth} from './ui-auth';

export async function appAuth(req: Request, res: Response, next: NextFunction) {
    const sso = getSsoService();
    if (sso) {
        framePolicy(res, sso.config);
        // Direct login/logout remain reachable with stale or revoked SSO cookies.
        if (req.path === '/auth/signin') {
            await onAuthSignin(req, res);
            return;
        }
        if (req.path === '/auth/logout') {
            await onAuthLogout(req, res);
            return;
        }
        if (req.cookies[sso.config.cookieName]) {
            try {
                await sso.authorize(req, res);
            } catch (error) {
                sso.fail(req, res, error);
                return;
            }
        }
    }
    if (req.routeInfo.ui) {
        await uiAuth(req, res, next);
    } else {
        await apiAuth(req, res, next);
    }
}
