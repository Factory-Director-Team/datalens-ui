import type {Request, Response} from '@gravity-ui/expresskit';
import pick from 'lodash/pick';

import type {EntryReadParams} from '../../shared';
import {EntryScope} from '../../shared';
import {Utils} from '../components';
import {Dash} from '../components/sdk';
import {DASH_ENTRY_RELEVANT_FIELDS} from '../constants';

// Loads a dashboard config for the anonymous public page. The dash entry is resolved via the US
// public-read path (master token, only-public), so it is served only when the dashboard is flagged
// public (ADR 0002 / ticket 03). Dependent charts are then run through /api/public/run carrying the
// publicDashId, which authorizes them in US via the dashboard's links.
export const publicDashController = async (req: Request, res: Response) => {
    try {
        const {
            params: {id},
            query,
            ctx,
        } = req;

        if (!id || id === 'null') {
            res.status(404).send({message: 'Dash not found'});
            return;
        }

        const result = await Dash.read(
            id,
            query as unknown as EntryReadParams | null,
            Utils.pickHeaders(req),
            ctx,
            {isPublic: true},
        );

        if (result.scope !== EntryScope.Dash) {
            res.status(404).send({message: 'No entry found'});
            return;
        }

        res.status(200).send(pick(result, DASH_ENTRY_RELEVANT_FIELDS));
    } catch (error) {
        const originalStatus = Utils.getErrorStatus(error);
        const errorStatus =
            originalStatus && [400, 403, 404].includes(originalStatus) ? originalStatus : 500;
        res.status(errorStatus).send({message: Utils.getErrorMessage(error)});
    }
};
