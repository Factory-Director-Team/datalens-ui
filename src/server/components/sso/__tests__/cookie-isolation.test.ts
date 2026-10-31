import type {NextFunction, Request, Response} from '@gravity-ui/expresskit';

import {createCookieIsolationMiddleware} from '../cookie-isolation';

function run(
    cookieHeader: string,
    parsedCookies: Record<string, string>,
    prefix = 'ahmad_preview_',
) {
    const headers = new Map<string, unknown>();
    const req = {
        headers: {cookie: cookieHeader},
        cookies: {...parsedCookies},
    } as unknown as Request;
    const res = {
        setHeader(name: string, value: unknown) {
            headers.set(name.toLowerCase(), value);
            return this;
        },
    } as unknown as Response;
    let nextCalled = false;
    createCookieIsolationMiddleware(prefix, 'auth')(req, res, (() => {
        nextCalled = true;
    }) as NextFunction);
    expect(nextCalled).toBe(true);
    return {req, res, headers};
}

test('uses only new UI cookies for auth and forwarded refresh requests', () => {
    const {req} = run(
        'auth=old-session; auth_exp=999; preference=dark; ahmad_preview_auth=new-session; ahmad_preview_auth_exp=123',
        {
            auth: 'old-session',
            auth_exp: '999',
            preference: 'dark',
            ahmad_preview_auth: 'new-session',
            ahmad_preview_auth_exp: '123',
        },
    );
    expect(req.headers.cookie).toBe('preference=dark; auth=new-session; auth_exp=123');
    expect(req.cookies).toEqual({preference: 'dark', auth: 'new-session', auth_exp: '123'});
});

test('does not accept an old UI session when no isolated session exists', () => {
    const {req} = run('auth=old-session; auth_exp=999', {auth: 'old-session', auth_exp: '999'});
    expect(req.headers.cookie).toBeUndefined();
    expect(req.cookies).toEqual({});
});

test.each([
    'auth=token; Domain=example.com; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax',
    'auth=token; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict; Secure',
])('isolates auth cookies from native login, refresh and SSO', (header) => {
    const {res, headers} = run('', {});
    res.setHeader('Set-Cookie', [header, 'auth_exp=123; Domain=example.com; HttpOnly; Path=/']);
    expect(headers.get('set-cookie')).toEqual([
        'ahmad_preview_auth=token; Max-Age=3600; Path=/; Secure; SameSite=Strict; HttpOnly',
        'ahmad_preview_auth_exp=123; Path=/; Secure; SameSite=Strict',
    ]);
});

test('clears only the new UI cookies on native logout and preserves expiry', () => {
    const {res, headers} = run('', {});
    res.setHeader('Set-Cookie', [
        'auth=; Domain=example.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
        'auth_exp=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'preference=light; Path=/',
    ]);
    expect(headers.get('set-cookie')).toEqual([
        'ahmad_preview_auth=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; SameSite=Strict; HttpOnly',
        'ahmad_preview_auth_exp=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; SameSite=Strict',
        'preference=light; Path=/',
    ]);
});

test('leaves ordinary auth unchanged when cookie isolation is disabled', () => {
    const {req, res, headers} = run('auth=old-session', {auth: 'old-session'}, '');
    expect(req.headers.cookie).toBe('auth=old-session');
    expect(req.cookies.auth).toBe('old-session');
    res.setHeader('Set-Cookie', 'auth=token; Domain=example.com; Path=/');
    expect(headers.get('set-cookie')).toBe('auth=token; Domain=example.com; Path=/');
});
