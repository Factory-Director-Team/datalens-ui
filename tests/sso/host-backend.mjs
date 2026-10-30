// Test-only host, never deploy this service with real credentials or expose its control API.
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import jwt from 'jsonwebtoken';
import yaml from 'js-yaml';

const fixtures = '/fixtures';
const hostOrigin = 'https://app.sso.example.com';
const biOrigin = 'https://bi.sso.example.com';
execFileSync(
    'openssl',
    [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '2',
        '-subj',
        '/CN=*.sso.example.com',
        '-addext',
        'subjectAltName=DNS:app.sso.example.com,DNS:bi.sso.example.com,DNS:untrusted.sso.example.com',
        '-keyout',
        `${fixtures}/tls.key`,
        '-out',
        `${fixtures}/tls.crt`,
    ],
    {stdio: 'ignore'},
);

const base = yaml.load(
    readFileSync(new URL('../docker-compose.base.yml', import.meta.url), 'utf8'),
);
const authPublicKey = base.services.auth.environment.TOKEN_PUBLIC_KEY.replace(/\\n/g, '\n');
const authPrivateKey = base.services.auth.environment.TOKEN_PRIVATE_KEY.replace(/\\n/g, '\n');
let sharedUserId;
for (let attempt = 0; attempt < 120; attempt++) {
    try {
        const response = await fetch('http://auth:8080/signin', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Origin: biOrigin},
            body: JSON.stringify({login: 'admin', password: 'sso-test-admin-password'}),
            signal: AbortSignal.timeout(2000),
            redirect: 'manual',
        });
        const cookie = response.headers.getSetCookie().find((item) => item.startsWith('auth='));
        if (!response.ok || !cookie) throw new Error('Auth not ready');
        const tokens = JSON.parse(decodeURIComponent(cookie.slice(5).split(';')[0]));
        sharedUserId = jwt.verify(tokens.accessToken, authPublicKey, {
            algorithms: ['PS256'],
        }).userId;
        writeFileSync(`${fixtures}/shared-user-id`, sharedUserId);
        await fetch('http://auth:8080/logout', {
            headers: {Cookie: cookie.split(';')[0]},
            signal: AbortSignal.timeout(2000),
        });
        break;
    } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}
if (!sharedUserId) throw new Error('Test auth service never became ready');

const sessions = new Map();
let outage = false;
let invalidResponse = false;
let unexpectedStatus = false;
const bridge = readFileSync('/opt/app/dist/public/sso-bridge.js', 'utf8');

function send(res, status, data) {
    res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(data));
}

async function body(req) {
    let data = '';
    for await (const chunk of req) {
        data += chunk;
        if (data.length > 16384) throw new Error('Request too large');
    }
    return data ? JSON.parse(data) : {};
}

createServer(async (req, res) => {
    try {
        const path = new URL(req.url, hostOrigin).pathname;
        if (path === '/health') return send(res, 200, {ready: true});
        if (path === '/bridge.js') {
            res.writeHead(200, {'Content-Type': 'text/javascript'});
            return res.end(bridge);
        }
        if (path === '/') {
            res.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control': 'no-store'});
            return res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><button id="open">Открыть DataLens</button><button id="logout">Выйти из приложения</button><p id="status"></p><iframe id="datalens" title="DataLens" hidden width="1200" height="800"></iframe><script src="/bridge.js"></script><script>
                window.ready = fetch('/test/session', {method: 'POST'}).then(r => r.json()).then(session => {
                    window.hostSession = session;
                    const iframe = document.getElementById('datalens');
                    const status = document.getElementById('status');
                    let controller;
                    async function open() {
                        controller?.abort();
                        const pending = new AbortController();
                        controller = pending;
                        status.textContent = 'OPENING';
                        try {
                            await openDataLens({iframe, biOrigin: '${biOrigin}', bearer: session.bearer, signal: pending.signal});
                            if (!pending.signal.aborted) status.textContent = 'OPEN';
                        } catch (error) { if (error.name !== 'AbortError') status.textContent = error.code || 'LOGIN_FAILED'; }
                    }
                    document.getElementById('open').onclick = open;
                    document.getElementById('logout').onclick = async () => {
                        controller?.abort();
                        iframe.hidden = true;
                        iframe.src = 'about:blank';
                        await fetch('/session/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + session.bearer}});
                        status.textContent = 'CLOSED';
                    };
                    if (!new URL(location.href).searchParams.has('manual')) return open();
                });
            </script></html>`);
        }
        if (path === '/test/session' && req.method === 'POST') {
            const sid = randomUUID();
            const bearer = randomUUID();
            sessions.set(sid, {bearer, active: true, datalens_access: true});
            return send(res, 200, {sid, bearer});
        }
        if (path === '/test/control' && req.method === 'POST') {
            const command = await body(req);
            if (typeof command.outage === 'boolean') outage = command.outage;
            if (typeof command.invalidResponse === 'boolean')
                invalidResponse = command.invalidResponse;
            if (typeof command.unexpectedStatus === 'boolean')
                unexpectedStatus = command.unexpectedStatus;
            if (command.sid && sessions.has(command.sid))
                Object.assign(sessions.get(command.sid), command);
            return send(res, 200, {});
        }
        if (path === '/test/machine-cookie') {
            const token = jwt.sign(
                {userId: sharedUserId, sessionId: 'test-machine', roles: ['datalens.admin']},
                authPrivateKey,
                {algorithm: 'PS256', expiresIn: 300},
            );
            return send(res, 200, {
                cookie: `auth=${encodeURIComponent(JSON.stringify({accessToken: token}))}`,
            });
        }
        const bearer = req.headers.authorization?.replace(/^Bearer /, '');
        const entry = [...sessions.entries()].find(
            ([, session]) => session.bearer === bearer && session.active,
        );
        if (path === '/bi/verify' && req.method === 'POST') {
            if (outage) return send(res, 503, {});
            if (invalidResponse) return send(res, 200, {active: 'yes', datalens_access: true});
            if (unexpectedStatus) return send(res, 202, {active: true, datalens_access: true});
            if (!entry) return send(res, 401, {});
            return send(res, 200, {active: true, datalens_access: entry[1].datalens_access});
        }
        if (!entry) return send(res, 401, {});
        const [, session] = entry;
        if (path === '/session/logout' && req.method === 'POST') {
            session.active = false;
            return send(res, 200, {});
        }
        return send(res, 404, {});
    } catch {
        return send(res, 500, {error: 'Test host request failed'});
    }
}).listen(8080, '0.0.0.0');
