import {getIsCompact} from '../asideHeader';

describe('getIsCompact', () => {
    const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

    afterEach(() => {
        if (originalLocalStorage) {
            Object.defineProperty(window, 'localStorage', originalLocalStorage);
        }
        jest.restoreAllMocks();
    });

    it('returns false when the browser denies storage access', () => {
        // Safari with site data blocked throws on access instead of returning null. This runs while
        // the reducer builds its initial state, so an uncaught throw blanks the whole page.
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            },
        });

        expect(getIsCompact()).toBe(false);
    });

    it('returns false when nothing is stored', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

        expect(getIsCompact()).toBe(false);
    });

    it('returns false when the stored value is not valid JSON', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('{');

        expect(getIsCompact()).toBe(false);
    });

    it('returns the stored value', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('true');

        expect(getIsCompact()).toBe(true);
    });
});
