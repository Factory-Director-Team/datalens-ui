import {expect, test} from '@playwright/test';

import {BI, HOST, createDashboard, openDataLens, profile} from './helpers';

test('opens the full DataLens iframe automatically without a second login', async ({page}) => {
    await page.goto(HOST);
    await expect(page.locator('#status')).toHaveText('OPEN');
    const frame = page.frameLocator('#datalens');
    await expect(frame.locator('body')).toContainText(/workbook|воркбук|коллекц/i);
    await expect(frame.locator('input[type="password"]')).toHaveCount(0);
    expect((await profile(page.request)).status()).toBe(200);
    expect(
        (await page.context().cookies(BI)).find((cookie) => cookie.name === 'auth'),
    ).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        domain: 'bi.sso.example.com',
    });
});

test.afterEach(async ({request}) => {
    await request.post(`${HOST}/test/control`, {
        data: {outage: false, invalidResponse: false, unexpectedStatus: false},
    });
});

test('accepts only the configured parent origin and the bearer header', async ({request}) => {
    const {bearer} = await (await request.post(`${HOST}/test/session`)).json();
    const preflight = await request.fetch(`${BI}/sso/login`, {
        method: 'OPTIONS',
        headers: {
            Origin: HOST,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization',
        },
    });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()['access-control-allow-origin']).toBe(HOST);
    expect(preflight.headers()['access-control-allow-credentials']).toBe('true');
    expect(preflight.headers()['access-control-allow-headers']).toBe('Authorization');
    for (const origin of ['', 'https://untrusted.sso.example.com']) {
        const response = await request.post(`${BI}/sso/login`, {
            headers: {Authorization: `Bearer ${bearer}`, ...(origin ? {Origin: origin} : {})},
        });
        expect(response.status()).toBe(403);
        expect(response.headers()['access-control-allow-origin']).toBeUndefined();
        expect(response.headers()['set-cookie']).toBeUndefined();
    }
    const missing = await request.post(`${BI}/sso/login`, {
        headers: {Origin: HOST},
        data: {bearer},
    });
    expect(missing.status()).toBe(401);
    expect(missing.headers()['set-cookie']).toBeUndefined();
});

for (const denied of ['invalid bearer', 'revoked session', 'missing permission']) {
    test(`refuses a new login with ${denied}`, async ({page}) => {
        await page.goto(`${HOST}/?manual=1`);
        await page.waitForFunction('Boolean(window.hostSession)');
        const session = await page.evaluate<{sid: string; bearer: string}>('window.hostSession');
        if (denied === 'invalid bearer') {
            await page.evaluate('window.hostSession.bearer = "invalid-bearer"');
        } else {
            await page.request.post(`${HOST}/test/control`, {
                data: {
                    sid: session.sid,
                    ...(denied === 'revoked session' ? {active: false} : {datalens_access: false}),
                },
            });
        }
        await page.getByRole('button', {name: 'Открыть DataLens'}).click();
        await expect(page.locator('#status')).toHaveText('HOST_DENIED');
        expect((await page.context().cookies(BI)).some((cookie) => cookie.name === 'auth')).toBe(
            false,
        );
        await expect(page.locator('#datalens')).toBeHidden();
    });
}

for (const failure of ['outage', 'invalidResponse', 'unexpectedStatus']) {
    test(`fails new login on host ${failure} without issuing cookies`, async ({page, request}) => {
        await request.post(`${HOST}/test/control`, {data: {[failure]: true}});
        await page.goto(HOST);
        await expect(page.locator('#status')).toHaveText('VERIFICATION_UNAVAILABLE');
        expect((await page.context().cookies(BI)).some((cookie) => cookie.name === 'auth')).toBe(
            false,
        );
    });
}

test('host revocation blocks new logins but the existing ordinary DataLens session keeps working', async ({
    page,
}) => {
    const session = await openDataLens(page);
    await page.request.post(`${HOST}/test/control`, {
        data: {sid: session.sid, datalens_access: false},
    });
    expect((await profile(page.request)).status()).toBe(200);
    await page.request.post(`${HOST}/session/logout`, {
        headers: {Authorization: `Bearer ${session.bearer}`},
    });
    const denied = await page.request.post(`${BI}/sso/login`, {
        headers: {Origin: HOST, Authorization: `Bearer ${session.bearer}`},
    });
    expect(denied.status()).toBe(401);
    expect((await profile(page.request)).status()).toBe(200);
    await page.request.post(`${HOST}/test/control`, {data: {outage: true}});
    expect(
        (
            await page.request.post(`${BI}/gateway/auth/auth/refreshTokens`, {
                headers: {Origin: BI},
            })
        ).status(),
    ).toBe(200);
    // Exercise the ordinary HTML refresh path as well as direct refresh.
    await page
        .context()
        .addCookies([{name: 'auth_exp', value: '1', url: BI, secure: true, sameSite: 'Strict'}]);
    expect((await page.request.get(`${BI}/`)).status()).toBe(200);
    expect((await profile(page.request)).status()).toBe(200);
    const loggedOut = await page.request.post(`${BI}/gateway/auth/auth/logout`, {
        headers: {Origin: BI},
    });
    expect(loggedOut.status()).toBe(200);
    expect((await profile(page.request)).status()).toBe(401);
});

test('native password login and logout work during host outage', async ({request}) => {
    await request.post(`${HOST}/test/control`, {data: {outage: true}});
    const login = await request.post(`${BI}/gateway/auth/auth/signin`, {
        headers: {Origin: BI},
        data: {login: 'admin', password: 'sso-test-admin-password'},
    });
    expect(login.status()).toBe(200);
    expect((await profile(request)).status()).toBe(200);
    expect(
        (await request.post(`${BI}/gateway/auth/auth/logout`, {headers: {Origin: BI}})).status(),
    ).toBe(200);
    expect((await profile(request)).status()).toBe(401);
});

test('logout in the iframe does not automatically sign in again or affect another browser', async ({
    page,
    browser,
}) => {
    await openDataLens(page);
    const other = await browser.newContext({ignoreHTTPSErrors: true});
    try {
        await openDataLens(await other.newPage());
        const auth = (await page.context().cookies(BI)).find((cookie) => cookie.name === 'auth');
        const otherAuth = (await other.cookies(BI)).find((cookie) => cookie.name === 'auth');
        expect(auth?.value).not.toBe(otherAuth?.value);
        const app = page.frames().find((frame) => frame.url().startsWith(BI))!;
        await app.goto(`${BI}/auth/logout`);
        await expect(
            page.frameLocator('#datalens').locator('input[type="password"]'),
        ).toBeVisible();
        expect((await profile(page.request)).status()).toBe(401);
        expect((await profile(other.request)).status()).toBe(200);
        await page.getByRole('button', {name: 'Открыть DataLens'}).click();
        await expect.poll(async () => (await profile(page.request)).status()).toBe(200);
    } finally {
        await other.close();
    }
});

test('a dashboard can be edited and published inside the full SSO iframe', async ({page}) => {
    await openDataLens(page);
    const dashboard = await createDashboard(page.request, {Origin: BI});
    const app = page.frames().find((item) => item.url().startsWith(BI))!;
    await app.goto(`${BI}/dashboards/${dashboard.entryId}`);
    await app.locator('[data-qa="action-button-edit"]').click();
    await app.locator('[data-qa="add-text-button"]').click();
    await app
        .locator('[data-qa="dialog-widget-text"] [contenteditable=true]')
        .fill('Edited inside the SSO iframe');
    await app.locator('[data-qa="dialog-widget-apply-btn"]').click();
    if (await app.locator('[data-qa="action-panel-button-save-as-draft"]').isVisible()) {
        await app.locator('[data-qa="action-button-save-as"]').click();
        await app.locator('[data-qa="action-panel-save-and-publish-dropdown-item"]').click();
    } else {
        await app.locator('[data-qa="action-panel-button-save"]').click();
    }
    await expect(app.locator('[data-qa="action-button-edit"]')).toBeVisible();
    await app.goto(`${BI}/dashboards/${dashboard.entryId}`);
    await expect(app.locator('body')).toContainText('Edited inside the SSO iframe');
});

test('machine BFF writes and anonymous Public link and Embed work during host verification outage', async ({
    request,
    browser,
}) => {
    const {cookie} = await (await request.get(`${HOST}/test/machine-cookie`)).json();
    const headers = {
        Cookie: cookie,
    };
    await request.post(`${HOST}/test/control`, {data: {outage: true}});
    // Existing MCP access uses its normal signed cookie, with no additional SSO credential.
    const dashboard = await createDashboard(request, headers);
    const publish = await request.post(`${BI}/gateway/root/us/switchEntryPublicationStatus`, {
        headers,
        data: {entryId: dashboard.entryId, publish: true},
    });
    expect(publish.status()).toBe(200);
    const anonymous = await browser.newContext({ignoreHTTPSErrors: true});
    try {
        const protectedEntry = await anonymous.request.post(`${BI}/gateway/root/us/getEntry`, {
            headers: {Origin: BI},
            data: {entryId: dashboard.entryId},
        });
        expect(protectedEntry.status()).toBe(401);
        const markdown = await anonymous.request.post(`${BI}/gateway/root/mix/renderMarkdown`, {
            headers: {Origin: BI},
            data: {text: 'SSO public content', lang: 'en'},
        });
        expect(markdown.status()).toBe(200);
        expect(markdown.headers()['set-cookie']).toBeUndefined();
        expect((await markdown.json()).result).toContain('SSO public content');
        const viewer = await anonymous.newPage();
        await viewer.goto(`${BI}/public/${dashboard.entryId}`);
        await expect(viewer.locator('body')).toContainText('SSO public content');
        expect((await anonymous.cookies(BI)).some((item) => item.name === 'auth')).toBe(false);
        expect(
            (
                await request.post(`${BI}/gateway/root/us/switchEntryPublicationStatus`, {
                    headers,
                    data: {entryId: dashboard.entryId, publish: false},
                })
            ).status(),
        ).toBe(200);
        const embed = await request.post(`${BI}/gateway/root/us/createEmbed`, {
            headers,
            data: {entryId: dashboard.entryId},
        });
        expect(embed.status()).toBe(200);
        const {token} = await embed.json();
        await viewer.goto(`${BI}/embed?dl_embed_token=${encodeURIComponent(token)}`);
        await expect(viewer.locator('body')).toContainText('SSO public content');
        expect((await anonymous.cookies(BI)).some((item) => item.name === 'auth')).toBe(false);
    } finally {
        await anonymous.close();
    }
});
