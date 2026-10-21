/* Load in the host application. Call once when opening its DataLens screen. */
window.openDataLens = async function openDataLens({iframe, biOrigin, bearer, signal}) {
    const origin = new URL(biOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== biOrigin) {
        throw new Error('biOrigin must be an HTTPS origin');
    }
    iframe.hidden = true;
    iframe.src = 'about:blank';
    const response = await fetch(`${biOrigin}/sso/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {Authorization: `Bearer ${bearer}`},
        signal,
    });
    if (!response.ok) {
        const {code = 'LOGIN_FAILED'} = await response.json().catch(() => ({}));
        throw Object.assign(new Error(code), {code});
    }
    if (signal?.aborted) return;
    iframe.src = `${biOrigin}/`;
    iframe.hidden = false;
};
