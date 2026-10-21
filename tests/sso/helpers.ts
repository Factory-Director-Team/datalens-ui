import type {APIRequestContext, Page} from '@playwright/test';
import {expect} from '@playwright/test';

export const HOST = 'https://app.sso.test';
export const BI = 'https://bi.sso.test';
export const PROFILE = `${BI}/gateway/root/auth/getMyUserProfile`;

export async function openDataLens(page: Page) {
    await page.goto(HOST);
    await expect(page.locator('#status')).toHaveText('OPEN');
    await expect(page.frameLocator('#datalens').locator('body')).toContainText(
        /workbook|collection|воркбук|коллекц/i,
    );
    return page.evaluate<{sid: string; bearer: string}>('window.hostSession');
}

export async function profile(request: APIRequestContext) {
    return request.post(PROFILE, {headers: {Origin: BI}, data: {}});
}

export async function createDashboard(request: APIRequestContext, headers: Record<string, string>) {
    const workbook = await request.post(`${BI}/gateway/root/us/createWorkbook`, {
        headers,
        data: {title: `SSO acceptance ${Date.now()}`},
    });
    expect(workbook.status()).toBe(200);
    const {workbookId} = await workbook.json();
    const response = await request.post(`${BI}/api/dash/v1/dashboards`, {
        headers,
        data: {
            workbookId,
            name: 'SSO acceptance dashboard',
            mode: 'publish',
            data: {
                salt: '0.1234567890123456',
                counter: 2,
                schemeVersion: 8,
                tabs: [
                    {
                        id: 'tab1',
                        title: 'Acceptance',
                        items: [
                            {
                                id: 'text1',
                                type: 'text',
                                namespace: 'default',
                                data: {text: 'SSO public content'},
                            },
                        ],
                        layout: [{i: 'text1', x: 0, y: 0, w: 36, h: 4}],
                        aliases: {},
                        connections: [],
                    },
                ],
                settings: {
                    autoupdateInterval: null,
                    maxConcurrentRequests: null,
                    silentLoading: false,
                    dependentSelectors: true,
                    hideTabs: false,
                    expandTOC: false,
                },
            },
        },
    });
    expect(response.status()).toBe(200);
    return response.json();
}
