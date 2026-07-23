import React from 'react';

import block from 'bem-cn-lite';
import type {RouteComponentProps} from 'react-router-dom';
import {PreviewQa} from 'shared';
import {DL, Utils} from 'ui';
import {ChartWrapper} from 'ui/components/Widgets/Chart/ChartWidgetWithProvider';
import {registry} from 'ui/registry';

import DashPage from '../DashPage/DashPage';

import './PublicPage.scss';

const b = block('dl-public-page');

type PublicPageProps = RouteComponentProps<{id: string}>;

// Anonymous public-link page. Renders chromelessly, and the entry's run requests go to /api/public/run
// (see isPublicMode() in the data provider); US only serves data for a public entry. The scope was
// resolved server-side (DL.publicScope): a dashboard reuses the normal DashPage (which loads its config
// via the public route and renders chromeless in public mode), a chart renders a single ChartWrapper.
const PublicPage: React.FC<PublicPageProps> = (props) => {
    const {
        match: {
            params: {id},
        },
        location: {search},
    } = props;

    const {extractEntryId} = registry.common.functions.getAll();
    const entryId = React.useMemo(() => extractEntryId(id), [id]);
    const params = React.useMemo(() => Utils.getParamsFromSearch(search), [search]);

    if (DL.PUBLIC_SCOPE === 'dash') {
        return <DashPage />;
    }

    // source is kept as a fallback so ChartKit renders its own 403/404 for a missing/non-public entry
    // instead of the DataLens layout.
    const chartKitProps: {id?: string; source?: string} = entryId
        ? {id: entryId}
        : {source: `/${id}`};

    return (
        <div className={b({mobile: DL.IS_MOBILE})} data-qa={PreviewQa.ChartWrapper}>
            <ChartWrapper usageType="chart" {...chartKitProps} params={params} noControls={true} />
        </div>
    );
};

export default PublicPage;
