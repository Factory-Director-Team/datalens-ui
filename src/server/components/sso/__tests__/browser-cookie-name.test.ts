import type {Request, Response} from '@gravity-ui/expresskit';

import {getOpensourceLayoutConfig} from '../../layout/opensource-layout-config';

jest.mock('../index', () => ({getSsoService: () => undefined}));
jest.mock('../../layout/utils', () => ({
    getChartkitLayoutSettings: () => ({scripts: [], inlineScripts: []}),
    getPlatform: () => 'desktop',
}));
jest.mock('../../../utils/language', () => ({addTranslationsScript: () => '/i18n.js'}));
jest.mock('../../../../shared', () => ({
    FALLBACK_LANGUAGES: ['en'],
    Language: {En: 'en'},
    USER_SETTINGS_KEY: 'userSettings',
}));

test('exposes the isolated cookie name to browser refresh while server auth stays canonical', async () => {
    const previous = process.env.SSO_COOKIE_PREFIX;
    process.env.SSO_COOKIE_PREFIX = 'ahmad_preview_';
    try {
        const config = {
            regionalEnvConfig: {allowLanguages: ['en']},
            authCookieName: undefined,
            endpoints: {ui: {}},
        };
        const req = {
            ctx: {
                config,
                get: () => () => ({bundleName: 'dl-main', DL: {}}),
                getMetadata: () => ({}),
            },
            cookies: {userSettings: '{"language":"en"}'},
            headers: {},
        } as unknown as Request;
        const res = {locals: {}} as Response;
        const result = await getOpensourceLayoutConfig({req, res, settingsId: 'dl-main'});
        expect(result.data?.DL.authCookieName).toBe('ahmad_preview_auth');
        expect(config.authCookieName).toBeUndefined();
    } finally {
        if (previous === undefined) delete process.env.SSO_COOKIE_PREFIX;
        else process.env.SSO_COOKIE_PREFIX = previous;
    }
});
