import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: process.env.SSO_REGISTRY_PHASE ? 'registry.test.ts' : 'handoff.test.ts',
    workers: 1,
    timeout: 60_000,
    expect: {timeout: 15_000},
    reporter: [
        ['list'],
        [
            'html',
            {
                outputFolder: `tests/artifacts/sso/${process.env.SSO_REGISTRY_PHASE || 'handoff'}`,
                open: 'never',
            },
        ],
    ],
    use: {ignoreHTTPSErrors: true, storageState: {cookies: [], origins: []}},
    projects: [
        {name: 'chromium', use: {browserName: 'chromium'}},
        {name: 'firefox', use: {browserName: 'firefox'}},
        {name: 'webkit', use: {browserName: 'webkit'}},
    ],
});
