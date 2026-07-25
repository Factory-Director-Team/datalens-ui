import {ACCESS_TOKEN_TIME_RESERVE} from '../../../shared/components/auth/constants/token';
import {getAuthExpCookieName} from '../../../shared/components/auth/utils';
import {DL} from '../../constants/common';
import {registry} from '../../registry';
import {isAnonymousMode} from '../../utils/embedded';
import Utils from '../../utils/utils';
import type {DatalensSdk, TypedSchema} from '../schematic-sdk';

let refreshPromise: Promise<unknown> | undefined;

// Whether the page the viewer is on has an auth session worth refreshing. DL.AUTH_ENABLED describes
// the *installation* — it says auth exists, not that this page is authenticated — so on an anonymous
// page (see isAnonymousMode) it is the wrong condition: with no session cookie the missing expiry reads
// as "expired", so every request fires a refresh that can only ever answer 401.
export const isAuthTokenRefreshEnabled = () => DL.AUTH_ENABLED && !isAnonymousMode();

const getRefreshPromise = () => {
    const sdk = registry.libs.schematicSdk.get() as DatalensSdk<TypedSchema>;
    return sdk.auth.auth
        .refreshTokens()
        .catch(() => {})
        .finally(() => {
            refreshPromise = undefined;
        });
};

export const refreshAuthToken = async () => {
    // Checked per call, not only where the transport installs the refresh: any call site that reaches
    // here from an anonymous page must stay silent too.
    if (!isAuthTokenRefreshEnabled()) {
        return;
    }

    if (refreshPromise) {
        await refreshPromise;
    } else {
        const authExpCookieName = getAuthExpCookieName(DL.AUTH_COOKIE_NAME);
        const exp = Number(Utils.getCookie(authExpCookieName));
        const now = Math.floor(new Date().getTime() / 1000);

        if (!exp || now + ACCESS_TOKEN_TIME_RESERVE > exp) {
            refreshPromise = getRefreshPromise();
            await refreshPromise;
        }
    }
};
