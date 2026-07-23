import type {Browser, Page} from '@playwright/test';
import {expect} from '@playwright/test';

import {PreviewQa} from '../../../../src/shared';
import type {TestParametrizationConfig} from '../../../types/config';
import {openTestPage, slct} from '../../../utils';
import datalensTest from '../../../utils/playwright/globalTestDefinition';

// Ticket 04 — Embed, single chart. This is the user-journey (E2E) seam described in the spec: an
// authenticated editor creates an Embed for a chart via the Share dialog, copies the ready-to-paste
// iframe snippet (embed URL + signed token), then an anonymous browser context (no auth cookies) opens
// the embed URL and the chart renders with no login redirect — while the object itself stays private.
//
// PENDING: kept skipped until the opensource-e2e stack proves out.
//   1. The embed-run data path (US embedded-entry token validation + BFF /api/embed/run) is only
//      exercisable against the full docker-compose stack, which is not wired here yet.
//   2. The data-api identity path is now wired (findings/01 resolved): on the anonymous embed run the BFF
//      attaches a minted service JWT so data-api accepts the query under the default AUTH_TYPE=NATIVE.
//      Exercising it end-to-end still needs the docker stack with AUTH_TOKEN_PRIVATE_KEY set.
//   3. Per the spec's testing caveat, the opensource-e2e environment may run with auth fully disabled;
//      there "anonymous vs. logged-in" is indistinguishable, so the load-bearing assertions (token
//      validation, parameter filtering, object privacy) rest on the US integration seam (embedded-entry
//      int tests, already green).
// When the stack is available this becomes the path smoke test below.
datalensTest.describe('Charts — Embed (single chart)', () => {
    datalensTest.skip(
        'An anonymous context renders an embedded chart from its iframe snippet',
        async ({
            browser,
            page,
            config,
        }: {
            browser: Browser;
            page: Page;
            config: TestParametrizationConfig;
        }) => {
            const previewUrl = config.charts.urls.FlatTableWithOneColumn;

            // 1. Editor creates an Embed via the Share dialog (Embed mode) and copies the snippet.
            await openTestPage(page, previewUrl);
            // TODO: open the chart menu → "Get link" → Embed tab → "Create embed" → read the token from
            // the generated iframe snippet.
            const embedToken = 'REPLACE_WITH_TOKEN_FROM_SNIPPET';
            const embedUrl = `/embed?dl_embed_token=${embedToken}`;

            // 2. Anonymous viewer (fresh context, no auth cookies) opens the embed URL.
            const anonymousContext = await browser.newContext({storageState: undefined});
            const anonymousPage = await anonymousContext.newPage();
            await anonymousPage.goto(embedUrl);
            await expect(anonymousPage.locator(slct(PreviewQa.ChartWrapper))).toBeVisible();

            await anonymousContext.close();
        },
    );
});
