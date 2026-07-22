import type {Browser, Page} from '@playwright/test';
import {expect} from '@playwright/test';

import {DashBodyQa} from '../../../../src/shared';
import type {TestParametrizationConfig} from '../../../types/config';
import {openTestPage, slct} from '../../../utils';
import datalensTest from '../../../utils/playwright/globalTestDefinition';

// Ticket 05 — Embed, dashboard. The user-journey (E2E) seam: an authenticated editor creates an Embed
// for a whole dashboard via the Share dialog and copies the ready-to-paste iframe snippet, then an
// anonymous browser context (no auth cookies) opens the embed URL and the dashboard renders — every
// dependent chart from live queries and a working selector — with no login redirect, while the object
// itself stays private. Combines the embed token flow (ticket 04) with the dependent-chart dashboard
// rendering (ticket 03).
//
// PENDING: kept skipped until the opensource-e2e stack proves out, for the same reasons as tickets 03/04.
//   1. The embedded-dashboard path (US embedded-entry token validation + dependent-entry authorization
//      via links + BFF /api/embed/dash + /api/embed/run) is only exercisable against the full
//      docker-compose stack, which is not wired here yet.
//   2. Rendering actual chart DATA anonymously additionally depends on the data-api identity work (see
//      .scratch/public-sharing-embedding/findings/01-data-api-anonymous-identity.md); under the default
//      AUTH_TYPE=NATIVE the dependent-chart queries 401 until that lands. Config resolution and token
//      validation still hold.
//   3. Per the spec's testing caveat, the opensource-e2e environment may run with auth fully disabled;
//      there "anonymous vs. logged-in" is indistinguishable, so the load-bearing authorization assertions
//      (a dashboard embed resolves its dependent charts, a non-dependency does not, a forged/deleted token
//      fails closed) rest on the US integration seam (embedded-dashboard.test.ts, already green).
// When the stack is available this becomes the path smoke test below.
datalensTest.describe('Dashboards — Embed', () => {
    datalensTest.skip(
        'An anonymous context renders an embedded dashboard, its charts, and a working selector',
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

            // 1. Editor creates a dashboard Embed via the entry menu → Share → Embed mode → "Create
            //    embed", and reads the token from the generated iframe snippet.
            await openTestPage(page, dashUrl);
            // TODO: open the entry context menu → Share → Embed tab → "Create embed" → read the token.
            const embedToken = 'REPLACE_WITH_TOKEN_FROM_SNIPPET';
            const embedUrl = `/embed?dl_embed_token=${embedToken}`;

            // 2. Anonymous viewer (fresh context, no auth cookies) opens the embed URL; the dashboard
            //    mounts chromeless (DL.embed.mode === 'dash').
            const anonymousContext = await browser.newContext({storageState: undefined});
            const anonymousPage = await anonymousContext.newPage();
            await anonymousPage.goto(embedUrl);
            await expect(anonymousPage.locator(slct(DashBodyQa.App))).toBeVisible();

            // TODO: assert every dependent chart renders (resolved by token + id), then change a selector
            // and assert the charts update; assert locked params are enforced and open params via the URL
            // are honored.

            // 3. Editor deletes the Embed; the same anonymous URL now fails closed (US stops serving it).
            // TODO: delete the embed, reload the anonymous page, assert the dashboard is gone.

            await anonymousContext.close();
        },
    );
});
