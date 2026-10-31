import {readFileSync} from 'fs';

export interface SsoConfig {
    hostOrigin: string;
    hostOrigins?: string[];
    biOrigin: string;
    verificationUrl: string;
    sharedLogin: string;
    sharedPassword: string;
    sharedUserId: string;
    authEndpoint: string;
    authPublicKey: string;
    cookieName: string;
}

function value(name: string, optional = false): string {
    const filename = process.env[`${name}_FILE`];
    const result = (filename ? readFileSync(filename, 'utf8') : process.env[name])?.trim();
    if (!result && !optional) {
        throw new Error(`SSO requires ${name} or ${name}_FILE`);
    }
    return result || '';
}

function origin(name: string, configured = value(name)): string {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.origin !== configured) {
        throw new Error(`${name} must be an HTTPS origin without a path`);
    }
    return url.origin;
}

export function loadSsoConfig(): SsoConfig | undefined {
    if (process.env.SSO_ENABLED !== 'true') {
        return undefined;
    }
    if (process.env.AUTH_ENABLED !== 'true') {
        throw new Error('SSO requires AUTH_ENABLED=true');
    }
    const hostOrigins = Array.from(
        new Set(
            [value('SSO_HOST_ORIGIN', true), ...value('SSO_HOST_ORIGINS', true).split(',')]
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item) => origin('SSO_HOST_ORIGINS', item)),
        ),
    );
    if (!hostOrigins.length) {
        throw new Error('SSO requires SSO_HOST_ORIGIN or SSO_HOST_ORIGINS');
    }
    return {
        hostOrigin: hostOrigins[0],
        hostOrigins,
        biOrigin: origin('SSO_BI_ORIGIN'),
        verificationUrl: value('SSO_VERIFICATION_URL'),
        sharedLogin: value('SSO_SHARED_LOGIN'),
        sharedPassword: value('SSO_SHARED_PASSWORD'),
        sharedUserId: value('SSO_SHARED_USER_ID'),
        authEndpoint: value('AUTH_ENDPOINT').replace(/\/$/, ''),
        authPublicKey: value('AUTH_TOKEN_PUBLIC_KEY').replace(/\\n/g, '\n'),
        cookieName: value('AUTH_COOKIE_NAME', true) || 'auth',
    };
}
