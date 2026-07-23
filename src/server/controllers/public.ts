import type {Request, Response} from '@gravity-ui/expresskit';

import {EntryScope, extractEntryId} from '../../shared';
import {Utils} from '../components';
import US from '../components/sdk/us';
import {registry} from '../registry';

// Serves the anonymous public-link HTML page for a chart or dashboard. Uses the 'public' layout
// settings so the bootstrap carries DL.public = true; authorization for the underlying data is
// enforced in US (ADR 0002). The entry's scope is resolved up front (via US public-read) and passed
// as DL.publicScope so the client mounts the right chromeless view — a single chart or a dashboard —
// with no flash. Only public entries resolve; a private/missing entry leaves the scope unset and the
// client surfaces the not-found state.
export const publicController = async (req: Request, res: Response) => {
    // The path segment may carry a slug (…/public/<id>-<slug>); strip it to the bare entry id.
    const entryId = extractEntryId(req.params.entryId) || req.params.entryId;

    try {
        const entry = await US.readPublicEntry(entryId, null, Utils.pickHeaders(req), req.ctx);
        res.locals.publicScope = entry.scope === EntryScope.Dash ? 'dash' : 'widget';
    } catch (error) {
        req.ctx.logError('PUBLIC_ENTRY_SCOPE_RESOLVE_FAILED', error);
    }

    const layoutConfig = await registry.useGetLayoutConfig({req, res, settingsId: 'public'});

    res.send(res.renderDatalensLayout(layoutConfig));
    return;
};
