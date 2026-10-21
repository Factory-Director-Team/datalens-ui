import {readFileSync} from 'fs';

export interface SsoConfig {
    hostOrigin: string;
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

function origin(name: string): string {
    const configured = value(name);
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
    return {
        hostOrigin: origin('SSO_HOST_ORIGIN'),
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
