import type {Browser, Page} from '@playwright/test';
import {expect} from '@playwright/test';

import {PreviewQa} from '../../../../src/shared';
import type {TestParametrizationConfig} from '../../../types/config';
import {openTestPage, slct} from '../../../utils';
import datalensTest from '../../../utils/playwright/globalTestDefinition';

// Ticket 01 — Public link, single chart (tracer). This is the user-journey (E2E) seam described in the
// spec: an authenticated editor publishes a chart, then an anonymous browser context (no auth cookies)
// opens the public URL and the chart renders with no login redirect; unpublishing makes it fail closed.
//
// PENDING: kept skipped until the opensource-e2e stack proves out.
//   1. The public-run data path (US public-read + BFF /api/public/run) is only exercisable against the
//      full docker-compose stack, which is not wired here yet.
//   2. Per the spec's testing caveat, the opensource-e2e environment may run with auth fully disabled;
//      there "anonymous vs. logged-in" is indistinguishable, so the load-bearing anonymity assertions
//      rest on the US integration seam (get-public-entry / switch-publication int tests, already green).
// When the stack is available this becomes the path smoke test below.
datalensTest.describe('Charts — Public link (tracer)', () => {
    datalensTest.skip(
        'An anonymous context renders a published chart and fails closed once unpublished',
        async ({
            browser,
            page,
            config,
        }: {
            browser: Browser;
            page: Page;
            config: TestParametrizationConfig;
        }) => {
            // The preview url encodes the chart entryId; the public page lives at /public/:entryId.
            const previewUrl = config.charts.urls.FlatTableWithOneColumn;
            const entryId = previewUrl.replace('/preview/', '').split('-')[0];
            const publicUrl = `/public/${entryId}`;

            // 1. Editor publishes the chart via the Share dialog (Public link toggle).
            await openTestPage(page, previewUrl);
            // TODO: open the chart menu → "Get link" → flip the Public link switch on.

            // 2. Anonymous viewer (fresh context, no auth cookies) opens the public URL.
            const anonymousContext = await browser.newContext({storageState: undefined});
            const anonymousPage = await anonymousContext.newPage();
            await anonymousPage.goto(publicUrl);
            await expect(anonymousPage.locator(slct(PreviewQa.ChartWrapper))).toBeVisible();

            // 3. Editor unpublishes; the same anonymous URL now fails closed (US stops serving it).
            // TODO: flip the Public link switch off, reload the anonymous page, assert the chart is gone.

            await anonymousContext.close();
        },
    );
});
