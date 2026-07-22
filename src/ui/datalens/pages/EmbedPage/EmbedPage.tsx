import React from 'react';

import block from 'bem-cn-lite';
import type {RouteComponentProps} from 'react-router-dom';
import {DL_EMBED_TOKEN_SEARCH_PARAM, PreviewQa} from 'shared';
import {DL, Utils} from 'ui';
import {ChartWrapper} from 'ui/components/Widgets/Chart/ChartWidgetWithProvider';

import './EmbedPage.scss';

const b = block('dl-embed-page');

type EmbedPageProps = RouteComponentProps;

// Anonymous Embed page (variant B). Renders chromelessly; the chart's run goes to /api/embed/run
// (see isEmbeddedEntry() in the data provider) carrying the signed token, and US resolves the (private)
// object against that token (ADR 0003). The object is addressed by the token, so the run is fired via
// `source` (not `id`) — an `id` would ask US to resolve by id, which is the embedded-dashboard path.
// The open (unsigned) parameters ride in the iframe URL; the token itself is stripped before they are
// passed through, and US/BFF enforce the locked-vs-open contract.
const EmbedPage: React.FC<EmbedPageProps> = (props) => {
    const {
        location: {search},
    } = props;

    const params = React.useMemo(() => {
        const parsed = Utils.getParamsFromSearch(search);
        delete parsed[DL_EMBED_TOKEN_SEARCH_PARAM];
        return parsed;
    }, [search]);

    const entryId = DL.EMBED_ENTRY_ID;

    // No resolvable object (missing or invalid token) — render nothing and let ChartKit surface the
    // failure via the run, keeping the page fail-closed rather than showing the DataLens layout.
    if (!entryId) {
        return null;
    }

    return (
        <div className={b({mobile: DL.IS_MOBILE})} data-qa={PreviewQa.ChartWrapper}>
            <ChartWrapper
                usageType="chart"
                source={`/${entryId}`}
                params={params}
                noControls={true}
            />
        </div>
    );
};

export default EmbedPage;
