import type {Request, Response} from '@gravity-ui/expresskit';

import {DL_EMBED_TOKEN_SEARCH_PARAM, EntryScope} from '../../shared';
import {Utils} from '../components';
import US from '../components/sdk/us';
import {registry} from '../registry';

// Serves the anonymous Embed HTML page (variant B). The signed Embed token arrives in the iframe URL
// (…/embed?dl_embed_token=…); it is handed to the client through DL.embedToken (via the 'embed' layout
// settings) so the client attaches it to chart runs. The object stays private — US resolves it only
// against a valid token (ADR 0002/0003), so no login and no public flag are involved. The token is
// resolved up front (via US) to learn the object's id, so the client mounts the chart with no flash;
// an invalid token leaves it unset and the client surfaces the not-found state.
export const embedController = async (req: Request, res: Response) => {
    const rawToken = req.query[DL_EMBED_TOKEN_SEARCH_PARAM];
    const embedToken = typeof rawToken === 'string' ? rawToken : '';
    res.locals.embedToken = embedToken;

    if (embedToken) {
        try {
            const {entry} = await US.readEmbeddedEntry(embedToken, Utils.pickHeaders(req), req.ctx);
            res.locals.embedEntryId = entry.entryId;
            // Resolve the object's scope up front so the client mounts the right chromeless view — a
            // single chart or a whole dashboard (its dependent charts served by the same token) — with
            // no flash (ticket 05). Mirrors publicController setting DL.publicScope.
            res.locals.embedScope = entry.scope === EntryScope.Dash ? 'dash' : 'chart';
        } catch (error) {
            req.ctx.logError('EMBED_ENTRY_RESOLVE_FAILED', error);
        }
    }

    const layoutConfig = await registry.useGetLayoutConfig({req, res, settingsId: 'embed'});

    res.send(res.renderDatalensLayout(layoutConfig));
    return;
};
