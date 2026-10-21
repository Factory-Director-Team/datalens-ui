import type {Page} from '@playwright/test';
import {expect, test} from '@playwright/test';

import {BI, HOST, PROFILE, createDashboard, openDataLens, profile} from './helpers';

test.afterEach(async ({request}) => {
    await request.post(`${HOST}/test/control`, {data: {outage: false}});
    await request.post(`${HOST}/test/registry`, {data: {restoreWrites: true}});
});

test('an authorised host user enters the full DataLens application without a second login', async ({
    page,
}) => {
    await openDataLens(page);
    const frame = page.frameLocator('#datalens');
    await expect(frame.locator('body')).toContainText(/workbook|воркбук|коллекц/i);
    await expect(frame.locator('input[type="password"]')).toHaveCount(0);
    const response = await profile(page.request);
    expect(response.status()).toBe(200);
    expect(JSON.stringify(await response.json())).toContain('admin');
    const workbook = await page.request.post(`${BI}/gateway/root/us/createWorkbook`, {
        headers: {Origin: BI},
        data: {title: `SSO acceptance ${Date.now()}`},
    });
    expect(workbook.status()).toBe(200);
    const created = await workbook.json();
    const app = page.frames().find((item) => item.url().startsWith(BI))!;
    await app.goto(`${BI}/workbooks/${created.workbookId}`);
    await expect(frame.locator('body')).toContainText(created.title);
});

test('host revocation denies the next HTML, data, mutation, export and refresh request', async ({
    page,
}) => {
    const session = await openDataLens(page);
    expect((await profile(page.request)).status()).toBe(200);
    await page.request.post(`${HOST}/test/control`, {
        data: {sid: session.sid, datalens_access: false},
    });
    // First request tests immediate online revocation; the rest test the revoked binding.
    expect((await profile(page.request)).status()).toBe(403);
    for (const route of [
        '/api/run',
        '/api/export',
        '/api/charts/v1/charts',
        '/gateway/auth/auth/refreshTokens',
    ]) {
        const response = await page.request.post(`${BI}${route}`, {
            headers: {Origin: BI},
            data: {},
        });
        expect(response.status(), route).toBe(401);
    }
    const html = await page.request.get(`${BI}/`);
    expect(html.status()).toBe(401);
    expect(await html.text()).toContain('Сессия DataLens завершена');
});

test('completed host logout rejects old bearer issuance and an existing BI session', async ({
    page,
}) => {
    const session = await openDataLens(page);
    await page.request.post(`${HOST}/session/logout`, {
        headers: {Authorization: `Bearer ${session.bearer}`},
    });
    expect((await profile(page.request)).status()).toBe(403);
    const ticket = await page.request.post(`${HOST}/bi/ticket`, {
        headers: {Authorization: `Bearer ${session.bearer}`},
        data: {},
    });
    expect(ticket.status()).toBe(401);
});

test('verification outage denies SSO, preserves the binding and leaves native login independent', async ({
    page,
    browser,
    request,
}) => {
    await openDataLens(page);
    await request.post(`${HOST}/test/control`, {data: {outage: true}});
    const unavailable = await profile(page.request);
    expect(unavailable.status()).toBe(503);
    expect(await unavailable.json()).toMatchObject({code: 'VERIFICATION_UNAVAILABLE'});
    const native = await browser.newContext({ignoreHTTPSErrors: true});
    try {
        const login = await native.request.post(`${BI}/gateway/auth/auth/signin`, {
            headers: {Origin: BI},
            data: {login: 'admin', password: 'sso-test-admin-password'},
        });
        expect(login.status()).toBe(200);
        expect((await profile(native.request)).status()).toBe(200);
        expect(
            (
                await native.request.post(`${BI}/gateway/auth/auth/refreshTokens`, {
                    headers: {Origin: BI},
                })
            ).status(),
        ).toBe(200);
        expect(
            (
                await native.request.post(`${BI}/gateway/auth/auth/logout`, {headers: {Origin: BI}})
            ).status(),
        ).toBe(200);
    } finally {
        await native.close();
    }
    await request.post(`${HOST}/test/control`, {data: {outage: false}});
    expect((await profile(page.request)).status()).toBe(200);
});

test('iframe logout stops SSO until explicit reopening and does not log out a second user', async ({
    page,
    browser,
    request,
}) => {
    await openDataLens(page);
    const other = await browser.newContext({ignoreHTTPSErrors: true});
    try {
        const otherPage = await other.newPage();
        await openDataLens(otherPage);
        const oldCookies = await page.context().cookies(BI);
        const first = oldCookies.find((cookie) => cookie.name === 'auth')!;
        const second = (await other.cookies(BI)).find((cookie) => cookie.name === 'auth')!;
        expect(first.value).not.toBe(second.value);
        const frame = page.frames().find((item) => item.url().startsWith(BI))!;
        await frame.goto(`${BI}/auth/logout`);
        await expect(page.locator('#status')).toHaveText('SIGNED_OUT');
        const before = await (await request.post(`${HOST}/test/control`, {data: {}})).json();
        // The protected request and UI redraw must not initiate another handoff.
        expect((await profile(page.request)).status()).toBe(401);
        await expect(page.frameLocator('#datalens').locator('body')).toContainText('Вы вышли');
        const after = await (await request.post(`${HOST}/test/control`, {data: {}})).json();
        expect(after.ticketsIssued).toBe(before.ticketsIssued);
        expect((await profile(other.request)).status()).toBe(200);
        const replay = await request.post(PROFILE, {
            headers: {Origin: BI, Cookie: `auth=${first.value}`},
            data: {},
        });
        expect(replay.status()).toBe(401);
        await page.getByRole('button', {name: 'Открыть DataLens'}).click();
        await expect.poll(async () => (await profile(page.request)).status()).toBe(200);
    } finally {
        await other.close();
    }
});

test('a machine cookie requires the separate service credential and cannot claim a browser exception', async ({
    request,
}) => {
    const {cookie} = await (await request.get(`${HOST}/test/machine-cookie`)).json();
    const denied = await request.post(PROFILE, {headers: {Cookie: cookie}, data: {}});
    expect(denied.status()).toBe(401);
    const spoofed = await request.post(PROFILE, {
        headers: {Cookie: cookie, 'x-datalens-machine-token': 'true'},
        data: {},
    });
    expect(spoofed.status()).toBe(401);
    const allowed = await request.post(PROFILE, {
        headers: {
            Cookie: cookie,
            'x-datalens-machine-token': 'test-machine-service-token-not-for-production',
        },
        data: {},
    });
    expect(allowed.status()).toBe(200);
    const browserAttempt = await request.post(PROFILE, {
        headers: {
            Cookie: cookie,
            Origin: BI,
            'x-datalens-machine-token': 'test-machine-service-token-not-for-production',
        },
        data: {},
    });
    expect(browserAttempt.status()).toBe(401);
});

test('SSO refresh retains the real session and checks host permission before refreshing', async ({
    page,
}) => {
    const host = await openDataLens(page);
    const authBefore = (await page.context().cookies(BI)).find((cookie) => cookie.name === 'auth');
    expect(authBefore).toBeDefined();
    const claims = (value: string) => {
        const {accessToken} = JSON.parse(decodeURIComponent(value));
        return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    };
    const sessionId = claims(authBefore!.value).sessionId;
    expect(authBefore).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        domain: 'bi.sso.test',
    });
    const refreshed = await page.request.post(`${BI}/gateway/auth/auth/refreshTokens`, {
        headers: {Origin: BI},
    });
    expect(refreshed.status()).toBe(200);
    const after = (await page.context().cookies(BI)).find((cookie) => cookie.name === 'auth');
    expect(claims(after!.value).sessionId).toBe(sessionId);
    // Exercise the HTML pre-refresh path without waiting for the default 15-minute TTL.
    await page
        .context()
        .addCookies([{name: 'auth_exp', value: '1', url: BI, secure: true, sameSite: 'Strict'}]);
    expect((await page.request.get(`${BI}/`)).status()).toBe(200);
    expect((await profile(page.request)).status()).toBe(200);
    await page.request.post(`${HOST}/test/control`, {
        data: {sid: host.sid, datalens_access: false},
    });
    expect(
        (
            await page.request.post(`${BI}/gateway/auth/auth/refreshTokens`, {
                headers: {Origin: BI},
            })
        ).status(),
    ).toBe(403);
});

test('two tabs can complete their independent pending transactions', async ({page, context}) => {
    const first = await pendingHandoff(page);
    const otherPage = await context.newPage();
    const second = await pendingHandoff(otherPage);
    expect(first.challenge.transaction_id).not.toBe(second.challenge.transaction_id);
    for (const handoff of [first, second]) {
        const {ticket} = await (
            await page.request.post(`${HOST}/bi/ticket`, {
                headers: {Authorization: `Bearer ${handoff.bearer}`},
                data: handoff.challenge,
            })
        ).json();
        const result = await page.request.post(`${BI}/sso/callback`, {
            headers: {Origin: HOST},
            form: {ticket},
            maxRedirects: 0,
        });
        expect(result.status()).toBe(303);
    }
    expect((await profile(page.request)).status()).toBe(200);
    await otherPage.close();
});

async function pendingHandoff(page: Page) {
    await page.goto(`${HOST}/?manual=1`);
    await page.waitForFunction('Boolean(window.sso)');
    await page.getByRole('button', {name: 'Открыть DataLens'}).click();
    await page.waitForFunction('Boolean(window.lastChallenge)');
    const challenge = await page.evaluate<{transaction_id: string; nonce: string}>(
        'window.lastChallenge',
    );
    const {sid, bearer} = await page.evaluate<{sid: string; bearer: string}>('window.hostSession');
    return {challenge, sid, bearer};
}

test('only one of two simultaneous ticket redemptions through the BFF replicas succeeds', async ({
    page,
}) => {
    const {challenge, bearer} = await pendingHandoff(page);
    const {ticket} = await (
        await page.request.post(`${HOST}/bi/ticket`, {
            headers: {Authorization: `Bearer ${bearer}`},
            data: challenge,
        })
    ).json();
    const redeem = () =>
        page.request.post(`${BI}/sso/callback`, {
            headers: {Origin: HOST},
            form: {ticket},
            maxRedirects: 0,
        });
    const responses = await Promise.all([redeem(), redeem()]);
    expect(responses.map((response) => response.status()).sort()).toEqual([303, 403]);
    expect((await redeem()).status()).toBe(403);
    expect((await profile(page.request)).status()).toBe(200);
});

test('a ticket is bound to its browser and cannot be used with another Origin', async ({
    page,
    request,
}) => {
    const {challenge, bearer} = await pendingHandoff(page);
    const {ticket} = await (
        await page.request.post(`${HOST}/bi/ticket`, {
            headers: {Authorization: `Bearer ${bearer}`},
            data: challenge,
        })
    ).json();
    const noBrowserBinding = await request.post(`${BI}/sso/callback`, {
        headers: {Origin: HOST},
        form: {ticket},
        maxRedirects: 0,
    });
    expect(noBrowserBinding.status()).toBe(403);
    const wrongOrigin = await page.request.post(`${BI}/sso/callback`, {
        headers: {Origin: 'https://untrusted.sso.test'},
        form: {ticket},
        maxRedirects: 0,
    });
    expect(wrongOrigin.status()).toBe(403);
    const valid = await page.request.post(`${BI}/sso/callback`, {
        headers: {Origin: HOST},
        form: {ticket},
        maxRedirects: 0,
    });
    expect(valid.status()).toBe(303);
    expect(valid.headers().location).toBe('/');
});

for (const [name, overrides] of Object.entries({
    issuer: {iss: 'other-host'},
    audience: {aud: 'other-bi'},
    nonce: {nonce: 'wrong-nonce-with-enough-length'},
    expired: {iat: 1, exp: 2},
    excessiveLifetime: {exp: Math.floor(Date.now() / 1000) + 3600},
})) {
    test(`rejects a signed ticket with invalid ${name} without issuing auth cookies`, async ({
        page,
    }) => {
        const {challenge, sid} = await pendingHandoff(page);
        const {ticket} = await (
            await page.request.post(`${HOST}/test/ticket`, {data: {sid, challenge, overrides}})
        ).json();
        const response = await page.request.post(`${BI}/sso/callback`, {
            headers: {Origin: HOST},
            form: {ticket},
            maxRedirects: 0,
        });
        expect(response.status()).toBe(403);
        expect((await page.context().cookies(BI)).some((cookie) => cookie.name === 'auth')).toBe(
            false,
        );
    });
}

test('the same browser can switch between native and SSO while retaining the policy of the presented session', async ({
    page,
}) => {
    const session = await openDataLens(page);
    await page.request.post(`${HOST}/test/control`, {
        data: {sid: session.sid, datalens_access: false},
    });
    expect((await profile(page.request)).status()).toBe(403);
    const login = await page.request.post(`${BI}/gateway/auth/auth/signin`, {
        headers: {Origin: BI},
        data: {login: 'admin', password: 'sso-test-admin-password'},
    });
    expect(login.status()).toBe(200);
    expect((await profile(page.request)).status()).toBe(200);
    // New host session and ticket create SSO provenance even though the account is unchanged.
    const newSession = await openDataLens(page);
    await page.request.post(`${HOST}/test/control`, {data: {sid: newSession.sid, active: false}});
    await expect.poll(async () => (await profile(page.request)).status()).not.toBe(200);
});

test('failed persistence after a real auth signin issues no BI cookies', async ({page}) => {
    const {challenge, bearer} = await pendingHandoff(page);
    const {ticket} = await (
        await page.request.post(`${HOST}/bi/ticket`, {
            headers: {Authorization: `Bearer ${bearer}`},
            data: challenge,
        })
    ).json();
    expect(
        (
            await page.request.post(`${HOST}/test/registry`, {
                data: {failNextRegistration: true},
            })
        ).status(),
    ).toBe(200);
    const response = await page.request.post(`${BI}/sso/callback`, {
        headers: {Origin: HOST},
        form: {ticket},
        maxRedirects: 0,
    });
    expect(response.status()).toBe(503);
    expect(await response.text()).toContain('временно');
    expect((await page.context().cookies(BI)).some((cookie) => cookie.name === 'auth')).toBe(false);
    expect((await profile(page.request)).status()).toBe(401);
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
        'x-datalens-machine-token': 'test-machine-service-token-not-for-production',
    };
    await request.post(`${HOST}/test/control`, {data: {outage: true}});
    // This is the same signed-cookie + separate-credential boundary used by datalens-mcp.
    const dashboard = await createDashboard(request, headers);
    const publish = await request.post(`${BI}/gateway/root/us/switchEntryPublicationStatus`, {
        headers,
        data: {entryId: dashboard.entryId, publish: true},
    });
    expect(publish.status()).toBe(200);
    const anonymous = await browser.newContext({ignoreHTTPSErrors: true});
    try {
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
