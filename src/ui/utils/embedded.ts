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

// True on an anonymous Embed page whose object is a whole dashboard (variant B, ticket 05). The scope
// was resolved server-side into DL.embed.mode; the client uses it to mount the dashboard view instead of
// a single chart, and to render it chromeless/read-only like a public dashboard.
export const isEmbeddedDashboard = () => {
    const embed = DL.EMBED;
    return typeof embed === 'object' && embed !== null && embed.mode === 'dash';
};

// True on the anonymous public-link page. Used to render chromelessly (no aside/mobile header) and to
// route chart runs to the anonymous /api/public/run endpoint.
export const isPublicMode = () => DL.PUBLIC;

// True when the current view is anonymous (no logged-in session) — a public link or an Embed. Both
// render chromeless and read-only, so dashboard chrome/edit/auth-poll are suppressed the same way for
// each. The older ?mode=embedded view (isEmbeddedMode) is chromeless too but keeps a real session, so it
// is deliberately NOT included here.
export const isAnonymousMode = () => isPublicMode() || isEmbeddedEntry();
