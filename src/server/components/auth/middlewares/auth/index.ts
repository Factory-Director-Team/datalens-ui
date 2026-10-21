import type {NextFunction, Request, Response} from '@gravity-ui/expresskit';

import {getSsoService} from '../../../sso';
import {framePolicy} from '../../../sso/frame-policy';

import {apiAuth} from './api-auth';
import {uiAuth} from './ui-auth';

export async function appAuth(req: Request, res: Response, next: NextFunction) {
    const sso = getSsoService();
    if (sso && req.routeInfo.ui) {
        framePolicy(res, sso.config);
    }
    if (req.routeInfo.ui) {
        await uiAuth(req, res, next);
    } else {
        await apiAuth(req, res, next);
    }
}
