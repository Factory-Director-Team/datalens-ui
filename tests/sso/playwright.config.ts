import {resolve} from 'node:path';

import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: '.',
    outputDir: resolve(__dirname, '../test-results/sso'),
    testMatch: 'login.test.ts',
    workers: 1,
    timeout: 60_000,
    expect: {timeout: 15_000},
    reporter: [
        ['list'],
        ['html', {outputFolder: resolve(__dirname, '../artifacts/sso'), open: 'never'}],
    ],
    use: {ignoreHTTPSErrors: true, storageState: {cookies: [], origins: []}},
    projects: [
        {name: 'chromium', use: {browserName: 'chromium'}},
        {name: 'firefox', use: {browserName: 'firefox'}},
        {name: 'webkit', use: {browserName: 'webkit'}},
    ],
});
