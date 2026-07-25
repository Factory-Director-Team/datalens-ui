import {getNavigationPathByKey} from '../entry';

describe('getNavigationPathByKey', () => {
    it('should return the folder the entry lives in', () => {
        expect(getNavigationPathByKey({key: 'Users/john/reports/Sales'})).toBe(
            'Users/john/reports',
        );
    });

    it('should return the root for an entry at the root', () => {
        expect(getNavigationPathByKey({key: 'Sales'})).toBe('/');
    });

    it('should return the root for an empty key', () => {
        expect(getNavigationPathByKey({key: ''})).toBe('/');
    });

    // An anonymously served entry (public link / Embed) carries no key at all — deriving a path from it
    // must report the root, not throw.
    it('should return the root when there is no key', () => {
        expect(getNavigationPathByKey({key: undefined})).toBe('/');
        expect(getNavigationPathByKey({key: null})).toBe('/');
    });
});
