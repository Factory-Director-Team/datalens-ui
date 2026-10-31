import type {NextFunction, Request, Response} from '@gravity-ui/expresskit';

import {getTenantSettingsMiddleware} from '../tenant-settings';

const mockGetTenantDetails = jest.fn();

jest.mock('../../registry', () => ({
    registry: {
        getGatewayApi: () => ({
            gatewayApi: {usPrivate: {_getTenantDetails: mockGetTenantDetails}},
        }),
        common: {auth: {getAll: () => ({getAuthArgsUSPrivate: () => ({})})}},
    },
}));
jest.mock('../../callbacks', () => ({
    onFail: (_req: Request, res: Response) => res.status(500).send('Tenant metadata unavailable'),
}));

function gatewayFailure(status: number) {
    return {error: {status, code: 'ERR_GATEWAY_REQUEST', message: 'Upstream request failed'}};
}

function run(fallback?: boolean) {
    return new Promise<{status: number; progressed: boolean; palette: unknown}>((resolve) => {
        let status = 200;
        const req = {
            ctx: {
                config: {usTenantSettings404Fallback: fallback},
                get: () => 'test-request',
                log: () => {},
                logError: () => {},
            },
            headers: {},
        } as unknown as Request;
        const res = {
            locals: {},
            status(value: number) {
                status = value;
                return this;
            },
            send() {
                resolve({
                    status,
                    progressed: false,
                    palette: res.locals.tenantDefaultColorPaletteId,
                });
            },
        } as unknown as Response;
        const next = (() => {
            resolve({status, progressed: true, palette: res.locals.tenantDefaultColorPaletteId});
        }) as NextFunction;
        getTenantSettingsMiddleware()(req, res, next);
    });
}

beforeEach(() => mockGetTenantDetails.mockReset());

test('continues HTML rendering without optional palette metadata for an opted-in legacy US 404', async () => {
    mockGetTenantDetails.mockRejectedValue(gatewayFailure(404));
    expect(await run(true)).toEqual({status: 200, progressed: true, palette: undefined});
});

test.each([undefined, false])(
    'keeps tenant metadata failures fatal by default (%s)',
    async (fallback) => {
        mockGetTenantDetails.mockRejectedValue(gatewayFailure(404));
        expect(await run(fallback)).toEqual({status: 500, progressed: false, palette: undefined});
    },
);

test.each([401, 403, 500])(
    'does not hide upstream HTTP %s when compatibility is enabled',
    async (status) => {
        mockGetTenantDetails.mockRejectedValue(gatewayFailure(status));
        expect(await run(true)).toEqual({status: 500, progressed: false, palette: undefined});
    },
);

test('does not hide an upstream timeout when compatibility is enabled', async () => {
    mockGetTenantDetails.mockRejectedValue(new Error('timeout'));
    expect(await run(true)).toEqual({status: 500, progressed: false, palette: undefined});
});

test('retains palette metadata from a supported tenant endpoint', async () => {
    mockGetTenantDetails.mockResolvedValue({
        responseData: {settings: {defaultColorPaletteId: 'palette-one'}},
    });
    expect(await run(true)).toEqual({status: 200, progressed: true, palette: 'palette-one'});
});

test('retains the ordinary default palette when successful metadata has no palette override', async () => {
    mockGetTenantDetails.mockResolvedValue({responseData: {}});
    expect(await run(true)).toEqual({status: 200, progressed: true, palette: undefined});
});

test('does not hide a malformed success response when compatibility is enabled', async () => {
    mockGetTenantDetails.mockResolvedValue({});
    expect(await run(true)).toEqual({status: 500, progressed: false, palette: undefined});
});
