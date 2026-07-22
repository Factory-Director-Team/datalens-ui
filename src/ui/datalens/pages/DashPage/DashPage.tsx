import React from 'react';
import {Switch, Route} from 'react-router-dom';

import {App as DashApp} from 'units/dash/containers/App/App';
import dash from 'units/dash/store/reducers/dash';
import wizard from 'units/wizard/reducers';
import {reducerRegistry} from '../../../store';

import 'ui/styles/dash.scss';
import 'ui/styles/dl-monaco.scss';

reducerRegistry.register({
    dash,
    wizard,
});

const routePaths = [
    '/dashboards/new',
    '/workbooks/:workbookId/dashboards',
    '/workbooks/:workbookId/dash',
    // Anonymous public dashboard link (ticket 03); the DashApp renders chromelessly in public mode.
    '/public/:id',
    '/:id',
];

const Dash = () => (
    <Switch>
        <Route path={routePaths} component={DashApp} />
    </Switch>
);

export default Dash;
