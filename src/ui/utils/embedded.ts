import {DL, EMBEDDED_MODE, URL_OPTIONS} from '../constants';

export const isIframe = () => {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
};

export const isEmbeddedMode = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isEmbeddedPreview = urlParams.get(URL_OPTIONS.EMBEDDED) === '1';
    const isEmbedded = urlParams.get('mode') === EMBEDDED_MODE.EMBEDDED;
    return isIframe() || isEmbedded || isEmbeddedPreview;
};

export const isTvMode = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isTv = urlParams.get('mode') === EMBEDDED_MODE.TV;
    return isTv;
};

export const isNoScrollMode = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isNoScrollEnabled = urlParams.get(URL_OPTIONS.NO_SCROLL) === '1';
    return isNoScrollEnabled && isEmbeddedMode();
};

export const isEmbeddedEntry = () => Boolean(DL.EMBED);

// True on the anonymous public-link page. Used to render chromelessly (no aside/mobile header) and to
// route chart runs to the anonymous /api/public/run endpoint.
export const isPublicMode = () => DL.PUBLIC;
