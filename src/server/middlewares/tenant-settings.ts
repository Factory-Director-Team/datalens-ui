import type {NextFunction, Request, Response} from '@gravity-ui/expresskit';
import {REQUEST_ID_PARAM_NAME} from '@gravity-ui/nodekit';

import {onFail} from '../callbacks';
import {registry} from '../registry';
import type {DatalensGatewaySchemas} from '../types/gateway';
import {isGatewayError} from '../utils/gateway';

export function getTenantSettingsMiddleware() {
    async function resolveTenantSettings(req: Request, res: Response, next: NextFunction) {
        const {ctx} = req;

        const requestId = req.ctx.get(REQUEST_ID_PARAM_NAME);
        const currentTenantId = 'common';

        const {gatewayApi} = registry.getGatewayApi<DatalensGatewaySchemas>();
        const {getAuthArgsUSPrivate} = registry.common.auth.getAll();
        const authArgsUSPrivate = getAuthArgsUSPrivate(req, res);

        let defaultColorPaletteId: string | undefined;
        try {
            const tenantDetailsResponse = await gatewayApi.usPrivate._getTenantDetails({
                ctx,
                headers: req.headers,
                requestId: requestId ?? '',
                authArgs: authArgsUSPrivate,
                args: {tenantId: currentTenantId},
            });
            defaultColorPaletteId =
                tenantDetailsResponse.responseData.settings?.defaultColorPaletteId;
        } catch (error) {
            if (
                !ctx.config.usTenantSettings404Fallback ||
                !isGatewayError(error) ||
                error.error.status !== 404
            ) {
                throw error;
            }
            // Older US versions do not expose this optional palette metadata endpoint.
            ctx.log('TENANT_SETTINGS_LEGACY_FALLBACK', {tenantId: currentTenantId});
        }
        res.locals.tenantDefaultColorPaletteId = defaultColorPaletteId;

        next();
    }

    return function resolveTenantSettingsMiddleware(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        resolveTenantSettings(req, res, next)
            .catch((error) => {
                req.ctx.logError('TENANT_RESOLVED_FAILED', error);
                onFail(req, res);
            })
            .catch((error) => next(error));
    };
}
