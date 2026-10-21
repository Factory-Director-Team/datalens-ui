import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';

import {expect, test} from '@playwright/test';

import {BI, HOST, openDataLens, profile} from './helpers';

// run.sh changes the real Docker infrastructure between phases, preserving browser cookies.
// Never inspect database rows or substitute an in-memory registry for this acceptance test.
const phase = process.env.SSO_REGISTRY_PHASE;

test('session provenance survives restart and fails closed on unavailable or lost storage', async ({
    browser,
}, info) => {
    const directory = 'tests/artifacts/sso-states';
    const file = `${directory}/${info.project.name}.json`;
    if (phase === 'prepare') {
        const states = {};
        for (const kind of ['sso', 'native', 'revoked']) {
            const context = await browser.newContext({ignoreHTTPSErrors: true});
            try {
                if (kind === 'native') {
                    const response = await context.request.post(`${BI}/gateway/auth/auth/signin`, {
                        headers: {Origin: BI},
                        data: {login: 'admin', password: 'sso-test-admin-password'},
                    });
                    expect(response.status()).toBe(200);
                } else {
                    const host = await openDataLens(await context.newPage());
                    if (kind === 'revoked') {
                        await context.request.post(`${HOST}/test/control`, {
                            data: {sid: host.sid, active: false},
                        });
                        expect((await profile(context.request)).status()).toBe(403);
                    }
                }
                Object.assign(states, {[kind]: await context.storageState()});
            } finally {
                await context.close();
            }
        }
        mkdirSync(directory, {recursive: true});
        writeFileSync(file, JSON.stringify(states));
        return;
    }

    expect(['restarted', 'unavailable', 'restored', 'lost']).toContain(phase);
    const states = JSON.parse(readFileSync(file, 'utf8'));
    for (const kind of ['sso', 'native', 'revoked']) {
        const context = await browser.newContext({
            ignoreHTTPSErrors: true,
            storageState: states[kind],
        });
        try {
            const expected =
                phase === 'unavailable' ? 503 : phase === 'lost' || kind === 'revoked' ? 401 : 200;
            await expect.poll(async () => (await profile(context.request)).status()).toBe(expected);
            expect((await context.request.get(`${BI}/`)).status()).toBe(expected);
            if (expected !== 200) {
                expect(
                    (
                        await context.request.post(`${BI}/gateway/auth/auth/refreshTokens`, {
                            headers: {Origin: BI},
                        })
                    ).status(),
                ).toBe(expected);
            }
        } finally {
            await context.close();
        }
    }
});
