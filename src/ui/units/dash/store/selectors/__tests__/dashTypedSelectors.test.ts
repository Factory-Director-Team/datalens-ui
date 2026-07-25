import type {DatalensGlobalState} from 'ui';

import {selectEntryTitle} from '../dashTypedSelectors';

const buildState = (entry: unknown) => ({dash: {entry}}) as DatalensGlobalState;

describe('selectEntryTitle', () => {
    it('should return the entry name from its key', () => {
        expect(selectEntryTitle(buildState({key: 'Users/john/reports/Sales'}))).toBe('Sales');
    });

    it('should return null when there is no entry', () => {
        expect(selectEntryTitle(buildState(null))).toBeNull();
    });

    // An anonymously served entry (public link / Embed) carries no key: entryId, scope and data only.
    it('should return null when the entry carries no key', () => {
        expect(selectEntryTitle(buildState({entryId: 'h7v7bbvvv7rk0', scope: 'dash'}))).toBeNull();
    });
});
