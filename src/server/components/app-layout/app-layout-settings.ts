import type {Meta} from '@gravity-ui/app-layout';
import type {Request, Response} from '@gravity-ui/expresskit';

import type {AppLayoutSettings, AppLayoutSettingsName} from '../../types/app-layout';
export const getAppLayoutSettings = (
    req: Request,
    res: Response,
    settingsId?: string,
): AppLayoutSettings => {
    const config = req.ctx.config;
    switch (settingsId as AppLayoutSettingsName) {
        case 'dl-main': {
            return {
                renderConfig: {title: config.serviceName},
                DL: {},
                bundleName: 'dl-main',
            };
        }
        case 'navigation': {
            return {
                renderConfig: {
                    title: `Navigation - ${config.serviceName}`,
                },
                DL: {},
                bundleName: 'dl-main',
            };
        }
        case 'landing-layout': {
            const pageSettings = req.ctx.get('landingPageSettings');

            if (!pageSettings) {
                throw new Error('Page settings are required');
            }

            const meta: Meta[] | undefined = pageSettings.pageMeta;

            return {
                renderConfig: {
                    title: pageSettings.title || '',
                    meta,
                    links: pageSettings.pageLinks,
                },
                DL: {
                    landingPageSettings: pageSettings,
                    isLanding: true,
                },
                bundleName: 'dl-main',
            };
        }
        case 'auth-layout': {
            return {
                renderConfig: {title: config.serviceName},
                DL: {},
                bundleName: 'dl-main',
            };
        }
        case 'public': {
            // Anonymous public-link page. DL.public makes the client render chromelessly and route
            // runs through /api/public/run (ADR 0002); DL.publicScope (resolved by publicController)
            // tells it whether to mount a single chart or a dashboard.
            return {
                renderConfig: {title: config.serviceName},
                DL: {
                    public: true,
                    publicScope: res.locals.publicScope as 'dash' | 'widget' | undefined,
                },
                bundleName: 'dl-main',
            };
        }
        default: {
            return {
                renderConfig: {title: 'default'},
                DL: {},
                bundleName: 'default',
            };
        }
    }
};
