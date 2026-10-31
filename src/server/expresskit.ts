import type {AppRoutes} from '@gravity-ui/expresskit';
import {ExpressKit} from '@gravity-ui/expresskit';
import type {NodeKit} from '@gravity-ui/nodekit';

import {createCookieIsolationMiddleware} from './components/sso/cookie-isolation';
import type {ExtendedAppRouteDescription} from './types/controllers';

export function getExpressKit({
    extendedRoutes,
    nodekit,
}: {
    extendedRoutes: Record<string, ExtendedAppRouteDescription>;
    nodekit: NodeKit;
}) {
    const routes: AppRoutes = {};
    Object.keys(extendedRoutes).forEach((key) => {
        const {route, guard, ...params} = extendedRoutes[key];
        if (guard) {
            params.afterAuth = [...params.afterAuth, guard];
        }
        routes[route] = params;
    });

    const app = new ExpressKit(nodekit, routes, (setup) => {
        setup.setupBaseMiddleware();
        setup.setupLangMiddleware();
        setup.setupParsers();
        setup.express.use(
            createCookieIsolationMiddleware(undefined, nodekit.config.authCookieName || 'auth'),
        );
        setup.setupRoutes();
        setup.setupErrorHandlers();
    });

    return app;
}
