import type {AppMiddleware, Request, Response} from '@gravity-ui/expresskit';
import {AuthPolicy} from '@gravity-ui/expresskit';
import type {AppContext} from '@gravity-ui/nodekit';

import {AppEnvironment} from '../../../shared';
import {getAuthArgs} from '../../../shared/schema/gateway-utils';
import {appEnv, isApiMode, isChartsMode, isDatalensMode, isFullMode} from '../../app-env';
import {getAuthRoutes} from '../../components/auth/routes';
import type {ChartsEngine} from '../../components/charts-engine';
import {embedController, publicController, publicDashController} from '../../controllers';
import {ping} from '../../controllers/ping';
import {workbooksTransferController} from '../../controllers/workbook-transfer';
import {getConnectorIconsMiddleware} from '../../middlewares';
import {getTenantSettingsMiddleware} from '../../middlewares/tenant-settings';
import type {ExtendedAppRouteDescription} from '../../types/controllers';
import {getConfiguredRoute, getDashboardsRedirectPath} from '../../utils/routes';
import {applyPluginRoutes} from '../charts/init-charts-engine';

export function getRoutes({
    ctx,
    chartsEngine,
    beforeAuth,
    afterAuth,
}: {
    ctx: AppContext;
    chartsEngine?: ChartsEngine;
    beforeAuth: AppMiddleware[];
    afterAuth: AppMiddleware[];
}) {
    let routes: Record<string, ExtendedAppRouteDescription> = {
        ping: {
            beforeAuth: [],
            afterAuth: [],
            route: 'GET /ping',
            handler: ping,
            authPolicy: AuthPolicy.disabled,
        },
    };

    if (appEnv === AppEnvironment.Development || isApiMode) {
        routes = {
            ...routes,
            ...getApiRoutes({beforeAuth, afterAuth}),
        };
    }

    if (ctx.config.isAuthEnabled) {
        routes = {...routes, ...getAuthRoutes({routeParams: {beforeAuth, afterAuth}})};
    }

    if (isFullMode || isDatalensMode) {
        routes = {...routes, ...getDataLensRoutes({ctx, beforeAuth, afterAuth})};
    }

    if (isFullMode || isChartsMode) {
        routes = {...routes, ...getChartsRoutes({chartsEngine, beforeAuth, afterAuth})};
    }

    return routes;
}

function getApiRoutes({
    beforeAuth,
    afterAuth,
}: {
    beforeAuth: AppMiddleware[];
    afterAuth: AppMiddleware[];
}) {
    const routes: Record<string, ExtendedAppRouteDescription> = {
        workbooksMetaManagerCapabilities: {
            handler: workbooksTransferController.capabilities,
            beforeAuth,
            afterAuth,
            route: 'GET /api/internal/v1/workbooks/meta-manager/capabilities/',
            authPolicy: AuthPolicy.disabled,
            disableCsrf: true,
        },
        workbooksExport: {
            handler: workbooksTransferController.export,
            beforeAuth,
            afterAuth,
            route: 'POST /api/internal/v1/workbooks/export/',
            authPolicy: AuthPolicy.disabled,
            disableCsrf: true,
        },
        workbooksImport: {
            handler: workbooksTransferController.import,
            beforeAuth,
            afterAuth,
            route: 'POST /api/internal/v1/workbooks/import/',
            authPolicy: AuthPolicy.disabled,
            disableCsrf: true,
        },
    };

    return routes;
}

function getDataLensRoutes({
    beforeAuth,
    afterAuth,
}: {
    ctx: AppContext;
    beforeAuth: AppMiddleware[];
    afterAuth: AppMiddleware[];
}) {
    const ui: Omit<ExtendedAppRouteDescription, 'handler' | 'route'> = {
        beforeAuth,
        afterAuth: [
            ...afterAuth,
            getConnectorIconsMiddleware({
                getAdditionalArgs: (req, res) => ({
                    authArgs: getAuthArgs(req, res),
                }),
            }),
            getTenantSettingsMiddleware(),
        ],
        ui: true,
    };

    const server: Omit<ExtendedAppRouteDescription, 'handler' | 'route'> = {
        beforeAuth,
        afterAuth,
    };

    const routes: Record<string, ExtendedAppRouteDescription> = {
        getConnections: getConfiguredRoute('navigation', {...ui, route: 'GET /connections'}),
        getDatasets: getConfiguredRoute('navigation', {...ui, route: 'GET /datasets'}),
        getWidgets: getConfiguredRoute('navigation', {...ui, route: 'GET /widgets'}),
        getDashboards: getConfiguredRoute('navigation', {...ui, route: 'GET /dashboards'}),
        getDatasetsAll: getConfiguredRoute('dl-main', {...ui, route: 'GET /datasets/*'}),
        getConnectionsAll: getConfiguredRoute('dl-main', {...ui, route: 'GET /connections/*'}),
        getSettingsAll: getConfiguredRoute('dl-main', {...ui, route: 'GET /settings/*'}),
        getDashboardsAll: {
            route: 'GET /dashboards/*',
            beforeAuth,
            afterAuth,
            handler: (req: Request, res: Response) => res.redirect(getDashboardsRedirectPath(req)),
        },

        getWizardAll: getConfiguredRoute('dl-main', {...ui, route: 'GET /wizard/*'}),
        getPreview: getConfiguredRoute('dl-main', {...ui, route: 'GET /preview*'}),
        // Anonymous public-link page for a single chart or dashboard. Auth is disabled so viewers
        // need no login; US serves the underlying data only if the entry is flagged public (ADR 0002).
        getPublicEntry: {
            ...ui,
            route: 'GET /public/:entryId',
            handler: publicController,
            authPolicy: AuthPolicy.disabled,
        },
        // Anonymous dashboard-config load for a public link. Resolves the dash via US public-read
        // (master token, only-public), so it returns a config only for a public dashboard (ticket 03).
        getPublicDash: {
            ...server,
            route: 'GET /api/public/dash/:id',
            handler: publicDashController,
            authPolicy: AuthPolicy.disabled,
        },
        // Anonymous Embed page (variant B): the iframe src. Auth is disabled so it renders with no
        // login; the signed Embed token in the URL is the capability, verified in US (ADR 0003).
        getEmbed: {
            ...ui,
            route: 'GET /embed',
            handler: embedController,
            authPolicy: AuthPolicy.disabled,
        },
        getWorkbooks: getConfiguredRoute('dl-main', {...ui, route: 'GET /workbooks*'}),

        postDeleteLock: getConfiguredRoute('api.deleteLock', {
            ...server,
            route: 'POST /api/private/deleteLock',
        }),

        postGateway: getConfiguredRoute('schematic-gateway', {
            ...server,
            route: 'POST /gateway/:scope/:service/:action?',
        }),

        getNavigate: getConfiguredRoute('navigate', {...ui, route: 'GET /navigate/:entryId'}),

        getEntry: getConfiguredRoute('dl-main', {...ui, route: 'GET  /:entryId'}),
        getNewWizard: getConfiguredRoute('dl-main', {...ui, route: 'GET  /:entryId/new/wizard'}),
        getWidget: getConfiguredRoute('dl-main', {...ui, route: 'GET  /:entryId/:widgetId'}),

        getRoot: getConfiguredRoute('dl-main', {...ui, route: 'GET /'}),

        getEditorAll: getConfiguredRoute('dl-main', {...ui, route: 'GET /editor*'}),

        getSql: {
            handler: (_req: Request, res: Response) => {
                res.redirect(`/ql`);
            },
            beforeAuth,
            afterAuth,
            route: 'GET /sql',
        },

        // Path to UI ql Charts
        getQlEntry: getConfiguredRoute('dl-main', {...ui, route: 'GET /ql/:entryId'}),
        getQlNew: getConfiguredRoute('dl-main', {...ui, route: 'GET /ql/new'}),
        getQlNnewMonitoringql: getConfiguredRoute('dl-main', {
            ...ui,
            route: 'GET /ql/new/monitoringql',
        }),
        getQlNewSql: getConfiguredRoute('dl-main', {...ui, route: 'GET /ql/new/sql'}),
        getQlNewPromql: getConfiguredRoute('dl-main', {...ui, route: 'GET /ql/new/promql'}),
        getEntrNewQl: getConfiguredRoute('dl-main', {...ui, route: 'GET  /:entryId/new/ql'}),
    };

    return routes;
}

function getChartsRoutes({
    chartsEngine,
    beforeAuth,
    afterAuth,
}: {
    chartsEngine?: ChartsEngine;
    beforeAuth: AppMiddleware[];
    afterAuth: AppMiddleware[];
}) {
    if (!chartsEngine) {
        return {};
    }

    const routes: Record<string, ExtendedAppRouteDescription> = {
        // Routes from Charts Engine
        postApiRun: {
            beforeAuth,
            afterAuth,
            route: 'POST /api/run',
            handler: chartsEngine.controllers.run,
        },
        // Anonymous run for a public link (no login). Config is resolved via the US public-read
        // endpoint, which returns only public entries (ADR 0002).
        postApiPublicRun: {
            beforeAuth,
            afterAuth,
            route: 'POST /api/public/run',
            handler: chartsEngine.controllers.publicRun,
            authPolicy: AuthPolicy.disabled,
        },
        // Anonymous run for an Embed (no login). The Embed token in the x-dl-embed-token header is
        // validated in US; locked/open parameters are enforced here in the embeds controller (ticket 04).
        postApiEmbedRun: {
            beforeAuth,
            afterAuth,
            route: 'POST /api/embed/run',
            handler: chartsEngine.controllers.embeds,
            authPolicy: AuthPolicy.disabled,
        },
        postApiExport: {
            beforeAuth,
            afterAuth,
            route: 'POST /api/export',
            handler: chartsEngine.controllers.export,
        },

        getApiPrivateConfig: {
            beforeAuth,
            afterAuth,
            route: 'GET  /api/private/config',
            handler: chartsEngine.controllers.config,
        },

        // Routes for charts
        postApiChartsV1Charts: {
            beforeAuth,
            afterAuth,
            route: 'POST /api/charts/v1/charts',
            handler: chartsEngine.controllers.charts.create,
        },
        getApiChartsV1ChartsEntryByKey: {
            beforeAuth,
            afterAuth,
            route: 'GET /api/charts/v1/charts/entryByKey',
            handler: chartsEngine.controllers.charts.entryByKey,
        },
        getApiChartsV1ChartsEntry: {
            beforeAuth,
            afterAuth,
            route: 'GET /api/charts/v1/charts/:entryId',
            handler: chartsEngine.controllers.charts.get,
        },
        postApiChartsV1ChartsEntry: {
            beforeAuth,
            afterAuth,
            route: 'POST /api/charts/v1/charts/:entryId',
            handler: chartsEngine.controllers.charts.update,
        },
        deleteApiChartsV1ChartsEntry: {
            beforeAuth,
            afterAuth,
            route: 'DELETE /api/charts/v1/charts/:entryId',
            handler: chartsEngine.controllers.charts.delete,
        },
    };

    // Apply routes from plugins
    applyPluginRoutes({chartsEngine, routes, beforeAuth, afterAuth});

    return routes;
}
