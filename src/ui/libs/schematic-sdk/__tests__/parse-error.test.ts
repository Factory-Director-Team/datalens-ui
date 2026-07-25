import type {DLGlobalData} from 'shared';
import {ErrorCode} from 'shared';

import type * as parseErrorModule from '../parse-error';

// The real module reaches the whole `ui` barrel through the dialog registry; only the action shape
// matters here.
jest.mock('store/actions/dialog', () => ({
    openDialog: (args: {id: symbol}) => ({type: 'OPEN_DIALOG', id: args.id}),
}));

// Fresh module per case: the "already shown" latch is module state.
const loadParseError = () => {
    let loaded!: typeof parseErrorModule;
    jest.isolateModules(() => {
        loaded = require('../parse-error');
    });
    return loaded;
};

const initialGlobals = window.DL;

const setGlobals = (globals: Partial<DLGlobalData>) => {
    window.DL = {...initialGlobals, ...globals} as DLGlobalData;
};

const handleNeedResetError = (globals: Partial<DLGlobalData>) => {
    setGlobals(globals);

    const {handleRequestError, registerSDKDispatch} = loadParseError();
    const dispatch = jest.fn();
    registerSDKDispatch(dispatch);

    expect(() => handleRequestError?.({data: {code: ErrorCode.NeedReset}} as never)).toThrow();

    return dispatch;
};

afterEach(() => {
    window.DL = initialGlobals;
});

describe('handleRequestError', () => {
    it('should offer a refresh when a session-carrying page loses its session', () => {
        expect(handleNeedResetError({isAuthEnabled: true})).toHaveBeenCalled();
    });

    // An anonymous page never had a session, so it cannot have lost one in another tab. The dialog is
    // inescapable and its only action reloads — which re-triggers the same error.
    it('should not offer a refresh on a public-link page', () => {
        expect(handleNeedResetError({isAuthEnabled: true, public: true})).not.toHaveBeenCalled();
    });

    it('should not offer a refresh on an Embed page', () => {
        expect(
            handleNeedResetError({isAuthEnabled: true, embed: {mode: 'dash'}}),
        ).not.toHaveBeenCalled();
    });
});
