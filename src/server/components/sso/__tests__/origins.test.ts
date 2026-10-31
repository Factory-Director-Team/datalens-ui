import type {Request, Response} from '@gravity-ui/expresskit';

import type {SsoConfig} from '../config';
import {framePolicy} from '../frame-policy';
import {SsoService} from '../service';

const config = {
    hostOrigin: 'https://192.168.3.6:8443',
    hostOrigins: ['https://192.168.3.6:8443', 'https://ahmadtea-fd.ru:8443'],
} as SsoConfig;

function response() {
    const headers = new Map<string, unknown>();
    const res = {
        setHeader(name: string, value: unknown) {
            headers.set(name, value);
            return this;
        },
        getHeader: (name: string) => headers.get(name),
        removeHeader: (name: string) => headers.delete(name),
        vary: () => {},
        status() {
            return this;
        },
        end: () => {},
    } as unknown as Response;
    return {res, headers};
}

test.each(config.hostOrigins || [])('allows exactly the configured parent %s', (origin) => {
    const {res, headers} = response();
    const req = {
        get: (name: string) => (name === 'origin' ? origin : 'POST'),
    } as unknown as Request;
    new SsoService(config).preflight(req, res);
    expect(headers.get('Access-Control-Allow-Origin')).toBe(origin);
});

test.each(['https://ahmadtea-fd.ru', 'https://untrusted.example.com:8443'])(
    'denies %s',
    (origin) => {
        const {res, headers} = response();
        const req = {get: () => origin} as unknown as Request;
        expect(() => new SsoService(config).preflight(req, res)).toThrow('ORIGIN_INVALID');
        expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    },
);

test('permits both parent origins without discarding other CSP directives', () => {
    const {res, headers} = response();
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    framePolicy(res, config);
    expect(headers.get('Content-Security-Policy')).toBe(
        "default-src 'self'; frame-ancestors 'self' https://192.168.3.6:8443 https://ahmadtea-fd.ru:8443",
    );
    expect(headers.has('X-Frame-Options')).toBe(false);
});
