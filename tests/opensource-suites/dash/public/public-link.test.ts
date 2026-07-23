import type {Browser, Page} from '@playwright/test';
import {expect} from '@playwright/test';

import {DashBodyQa} from '../../../../src/shared';
import type {TestParametrizationConfig} from '../../../types/config';
import {openTestPage, slct} from '../../../utils';
import datalensTest from '../../../utils/playwright/globalTestDefinition';

// Ticket 03 — Public link, dashboard. The user-journey (E2E) seam: an authenticated editor publishes a
// dashboard, then an anonymous browser context (no auth cookies) opens the public URL, every dependent
// chart renders from live queries, and a selector updates them; reverting to private fails it closed.
//
// PENDING: kept skipped until the opensource-e2e stack proves out.
//   1. The public dashboard path (US public-read + dependent-chart authorization via links + BFF
//      /api/public/dash + /api/public/run) is only exercisable against the full docker-compose stack.
//   2. Rendering actual chart DATA anonymously is now unblocked: the data-api identity work has landed
//      (see .scratch/public-sharing-embedding/findings/01-data-api-anonymous-identity.md) — the BFF attaches
//      a minted service JWT so the dependent-chart queries pass data-api under the default AUTH_TYPE=NATIVE.
//      Exercising it end-to-end still needs the docker stack.
//   The load-bearing authorization assertions (a public dashboard's deps resolve, a non-public dash's do
//   not, a non-dependency does not) are covered now by the US int test get-public-dashboard-deps.test.ts.
datalensTest.describe('Dashboards — Public link (tracer)', () => {
    datalensTest.skip(
        'An anonymous context renders a published dashboard, its charts, and a working selector',
        async ({
            browser,
            page,
            config,
        }: {
            browser: Browser;
            page: Page;
            config: TestParametrizationConfig;
        }) => {
            const dashUrl = config.dash.urls.DashboardWithTabsAndSelectors;
            const entryId = dashUrl.split('/').filter(Boolean).pop()!.split('-')[0];
            const publicUrl = `/public/${entryId}`;

            // 1. Editor publishes the dashboard via the entry menu → Share → Public link toggle.
            await openTestPage(page, dashUrl);
            // TODO: open the entry context menu → Share → flip the Public link switch on.

            // 2. Anonymous viewer (fresh context, no auth cookies) opens the public dashboard URL.
            const anonymousContext = await browser.newContext({storageState: undefined});
            const anonymousPage = await anonymousContext.newPage();
            await anonymousPage.goto(publicUrl);
            await expect(anonymousPage.locator(slct(DashBodyQa.App))).toBeVisible();

            // TODO: assert every dependent chart renders, then change a selector and assert the charts update.

            // 3. Editor unpublishes; the same anonymous URL now fails closed (US stops serving it).
            // TODO: flip the Public link switch off, reload the anonymous page, assert the dashboard is gone.

            await anonymousContext.close();
        },
    );
});
