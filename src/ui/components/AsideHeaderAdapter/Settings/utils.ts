import type {ThemeSettings} from '@gravity-ui/uikit';
import {I18n} from 'i18n';
import {DARK_THEME, DEFAULT_THEME_CONFIG, LIGHT_THEME, SYSTEM_THEME} from 'shared';
import type {DLUserSettings} from 'shared/types/common';

import type {ThemeSettingsUpdates} from './types';
import {HighcontrastValue} from './types';

const i18n = I18n.keyset('component.aside-header-settings.view');

export const getLocalTheme = (): {theme: string; themeSettings: ThemeSettings} => {
    // Called while the store module is evaluated, before React mounts: a browser that denies site
    // data throws on localStorage access instead of returning null, and an uncaught throw here
    // blanks the whole page — including the sign-in form.
    let rawUserSettings: string | null = null;

    try {
        rawUserSettings = localStorage.getItem('userSettings');
    } catch (err) {
        return DEFAULT_THEME_CONFIG;
    }

    if (!rawUserSettings) {
        return DEFAULT_THEME_CONFIG;
    }

    try {
        const parsedUserSettings: Partial<DLUserSettings> = JSON.parse(rawUserSettings);

        return {
            theme: parsedUserSettings.theme || DEFAULT_THEME_CONFIG.theme,
            themeSettings: parsedUserSettings.themeSettings || DEFAULT_THEME_CONFIG.themeSettings,
        };
    } catch (err) {
        return DEFAULT_THEME_CONFIG;
    }
};

export const isHcEnabled = (settings?: ThemeSettings) => {
    return settings?.systemLightTheme === 'light-hc';
};

const getThemeValue = (themeType: string, hcEnabled: boolean) => {
    return `${themeType}${hcEnabled ? '-hc' : ''}`;
};

export const getThemeUpdates = (
    theme: string,
    themeType: string,
    hcEnabled: boolean,
): ThemeSettingsUpdates => {
    return {
        theme: theme === SYSTEM_THEME ? theme : getThemeValue(themeType, hcEnabled),
        themeSettings: {
            systemLightTheme: getThemeValue('light', hcEnabled),
            systemDarkTheme: getThemeValue('dark', hcEnabled),
        },
    };
};

export const getThemeOptions = () => [
    {value: LIGHT_THEME, content: i18n('value_theme-light')},
    {value: DARK_THEME, content: i18n('value_theme-dark')},
    {value: SYSTEM_THEME, content: i18n('value_theme-system')},
];
export const getHighcontrastOptions = () => [
    {value: HighcontrastValue.normal, content: i18n('value_theme-contrast-normal')},
    {value: HighcontrastValue.hc, content: i18n('value_theme-contrast-enhanced')},
];
