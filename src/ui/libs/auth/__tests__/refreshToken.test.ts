import type {DLGlobalData} from 'shared';

import type * as refreshTokenModule from '../refreshToken';

let mockAuthExpCookie: string | undefined;
const mockRefreshTokens = jest.fn(() => Promise.resolve());

jest.mock('../../../utils/utils', () => ({
    __esModule: true,
    default: {getCookie: () => mockAuthExpCookie},
}));

jest.mock('../../../registry', () => ({
    registry: {
        libs: {
            schematicSdk: {
                get: () => ({auth: {auth: {refreshTokens: mockRefreshTokens}}}),
            },
        },
    },
}));

// Fresh module per case so the in-flight refresh promise does not leak between them.
const loadRefreshToken = () => {
    let loaded!: typeof refreshTokenModule;
    jest.isolateModules(() => {
        loaded = require('../refreshToken');
    });
    return loaded;
};

const initialGlobals = window.DL;

const setGlobals = (globals: Partial<DLGlobalData>) => {
    window.DL = {...initialGlobals, ...globals} as DLGlobalData;
};

beforeEach(() => {
    mockAuthExpCookie = undefined;
    mockRefreshTokens.mockClear();
});

afterEach(() => {
    window.DL = initialGlobals;
});

describe('isAuthTokenRefreshEnabled', () => {
    it('should be disabled when the installation runs without auth', () => {
        setGlobals({isAuthEnabled: false});

        expect(loadRefreshToken().isAuthTokenRefreshEnabled()).toBe(false);
    });

    it('should be enabled on an ordinary page of an installation with auth', () => {
        setGlobals({isAuthEnabled: true});

        expect(loadRefreshToken().isAuthTokenRefreshEnabled()).toBe(true);
    });

    // isAuthEnabled describes the installation, not the page: an anonymous page is authorized by its
    // URL alone and carries no session, so there is nothing to refresh there.
    it('should be disabled on a public-link page of an installation with auth', () => {
        setGlobals({isAuthEnabled: true, public: true});

        expect(loadRefreshToken().isAuthTokenRefreshEnabled()).toBe(false);
    });

    it('should be disabled on an Embed page of an installation with auth', () => {
        setGlobals({isAuthEnabled: true, embed: {mode: 'chart'}});

        expect(loadRefreshToken().isAuthTokenRefreshEnabled()).toBe(false);
    });
});

describe('refreshAuthToken', () => {
    it('should refresh on an ordinary page whose access token has no recorded expiry', async () => {
        setGlobals({isAuthEnabled: true});

        await loadRefreshToken().refreshAuthToken();

        expect(mockRefreshTokens).toHaveBeenCalled();
    });

    it('should refresh on an ordinary page whose access token is about to expire', async () => {
        setGlobals({isAuthEnabled: true});
        mockAuthExpCookie = String(Math.floor(Date.now() / 1000) + 10);

        await loadRefreshToken().refreshAuthToken();

        expect(mockRefreshTokens).toHaveBeenCalled();
    });

    it('should not refresh on an ordinary page whose access token is still fresh', async () => {
        setGlobals({isAuthEnabled: true});
        mockAuthExpCookie = String(Math.floor(Date.now() / 1000) + 3600);

        await loadRefreshToken().refreshAuthToken();

        expect(mockRefreshTokens).not.toHaveBeenCalled();
    });

    // The bug this guards: with no session cookie the missing expiry reads as "expired", so every
    // request from an anonymous page fired a refresh that could only ever answer 401.
    it('should not call the auth service on a public-link page', async () => {
        setGlobals({isAuthEnabled: true, public: true});

        await loadRefreshToken().refreshAuthToken();

        expect(mockRefreshTokens).not.toHaveBeenCalled();
    });

    it('should not call the auth service on an Embed page', async () => {
        setGlobals({isAuthEnabled: true, embed: {mode: 'dash'}});

        await loadRefreshToken().refreshAuthToken();

        expect(mockRefreshTokens).not.toHaveBeenCalled();
    });
});
