import type {AppThunkAction} from '../index';

export const getIsCompact = (): boolean => {
    // Runs while the aside-header reducer builds its initial state, before React mounts: a browser
    // that denies site data throws on localStorage access, and an uncaught throw here blanks the
    // whole page — including the sign-in form.
    let isCompactValue: string | null = null;

    try {
        isCompactValue = localStorage.getItem('isCompact');
    } catch (err) {
        return false;
    }

    if (!isCompactValue) {
        return false;
    }

    try {
        return JSON.parse(isCompactValue);
    } catch (err) {
        return false;
    }
};

export const updateIsCompact = (isCompact: boolean): AppThunkAction => {
    return () => {
        localStorage.setItem('isCompact', JSON.stringify(isCompact));
    };
};
