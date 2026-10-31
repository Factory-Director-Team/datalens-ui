import type {AppMiddleware} from '@gravity-ui/expresskit';

function cookiePrefix(configured = process.env.SSO_COOKIE_PREFIX || '') {
    if (configured && !/^[A-Za-z0-9_]{1,64}$/.test(configured)) {
        throw new Error('SSO_COOKIE_PREFIX must contain only letters, digits or underscores');
    }
    return configured;
}

export function getBrowserAuthCookieName(cookieName?: string) {
    const prefix = cookiePrefix();
    return prefix ? `${prefix}${cookieName || 'auth'}` : cookieName;
}

export function createCookieIsolationMiddleware(
    configuredPrefix?: string,
    cookieName = 'auth',
): AppMiddleware {
    const prefix = cookiePrefix(configuredPrefix);
    if (!prefix) {
        return (_req, _res, next) => next();
    }
    const names = [cookieName, `${cookieName}_exp`];
    const externalNames = names.map((name) => `${prefix}${name}`);

    return (req, res, next) => {
        // The old UI's canonical cookies must never authorize or refresh the new UI.
        const cookies = (req.headers.cookie || '')
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
            .flatMap((part) => {
                const separator = part.indexOf('=');
                const name = part.slice(0, separator);
                if (names.includes(name)) return [];
                const index = externalNames.indexOf(name);
                return [index < 0 ? part : `${names[index]}${part.slice(separator)}`];
            });
        if (cookies.length) req.headers.cookie = cookies.join('; ');
        else delete req.headers.cookie;

        names.forEach((name, index) => {
            delete req.cookies[name];
            if (Object.prototype.hasOwnProperty.call(req.cookies, externalNames[index])) {
                req.cookies[name] = req.cookies[externalNames[index]];
                delete req.cookies[externalNames[index]];
            }
        });

        const isolate = (header: string) => {
            const [pair, ...attributes] = header.split(';');
            const separator = pair.indexOf('=');
            const name = pair.slice(0, separator).trim();
            if (!names.includes(name)) return header;
            const preserved = attributes
                .map((attribute) => attribute.trim())
                .filter(
                    (attribute) =>
                        attribute &&
                        !/^(domain|path|secure|httponly|samesite)(?:=|$)/i.test(attribute),
                );
            return [
                `${prefix}${name}${pair.slice(separator)}`,
                ...preserved,
                'Path=/',
                'Secure',
                'SameSite=Strict',
                ...(name === cookieName ? ['HttpOnly'] : []),
            ].join('; ');
        };
        const setHeader = res.setHeader;
        res.setHeader = (name, value) => {
            if (name.toLowerCase() === 'set-cookie') {
                return setHeader.call(
                    res,
                    name,
                    Array.isArray(value) ? value.map(isolate) : isolate(String(value)),
                );
            }
            return setHeader.call(res, name, value);
        };
        next();
    };
}
