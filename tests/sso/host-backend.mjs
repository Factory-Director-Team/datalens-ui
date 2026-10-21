// Test-only host, never deploy this service with real credentials or expose its control API.
import {generateKeyPairSync, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import yaml from 'js-yaml';

const fixtures = '/fixtures';
const hostOrigin = 'https://app.sso.test';
const biOrigin = 'https://bi.sso.test';
const serviceToken = 'test-host-service-token-not-for-production';
const {privateKey, publicKey} = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {type: 'spki', format: 'pem'},
    privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
});
writeFileSync(`${fixtures}/ticket-public.pem`, publicKey);
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
        '/CN=*.sso.test',
        '-addext',
        'subjectAltName=DNS:app.sso.test,DNS:bi.sso.test,DNS:untrusted.sso.test',
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

const registry = new Redis('redis://redis:6379');
let failNextRegistration = false;
const sessions = new Map();
let outage = false;
let ticketsIssued = 0;
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
                    window.sso = new DataLensSSO({iframe: document.getElementById('datalens'), biOrigin: '${biOrigin}',
                        getTicket: async challenge => {
                            window.lastChallenge = challenge;
                            if (new URL(location.href).searchParams.has('manual')) return new Promise(resolve => window.finishTicket = resolve);
                            const response = await fetch('/bi/ticket', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + session.bearer}, body: JSON.stringify(challenge)});
                            if (!response.ok) throw Object.assign(new Error('Ticket request failed'), {code: [401, 403].includes(response.status) ? 'HOST_DENIED' : 'VERIFICATION_UNAVAILABLE'});
                            return (await response.json()).ticket;
                        }, onStatus: code => document.getElementById('status').textContent = code});
                    document.getElementById('open').onclick = () => window.sso.open();
                    document.getElementById('logout').onclick = async () => {
                        await fetch('/session/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + session.bearer}});
                        window.sso.close();
                    };
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
            if (command.sid && sessions.has(command.sid))
                Object.assign(sessions.get(command.sid), command);
            return send(res, 200, {ticketsIssued});
        }
        // Real infrastructure fault injection, confined to this disposable Docker project.
        // Assertions remain at BFF HTTP/browser boundaries; no registry records are inspected.
        if (path === '/test/registry' && req.method === 'POST') {
            const command = await body(req);
            if (command.restoreWrites) {
                failNextRegistration = false;
                await registry.config('SET', 'maxmemory', '0');
            }
            if (command.failNextRegistration) failNextRegistration = true;
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
        if (path === '/test/ticket' && req.method === 'POST') {
            const {sid, challenge, overrides = {}, type = 'datalens-sso+jwt'} = await body(req);
            const now = Math.floor(Date.now() / 1000);
            const ticket = jwt.sign(
                {
                    host_sid: sid,
                    ...challenge,
                    iss: 'test-host',
                    aud: 'test-datalens',
                    iat: now,
                    exp: now + 60,
                    jti: randomUUID(),
                    ...overrides,
                },
                privateKey,
                {
                    algorithm: 'RS256',
                    header: {typ: type, alg: 'RS256'},
                },
            );
            return send(res, 200, {ticket});
        }
        if (path === '/bi/verify' && req.method === 'POST') {
            if (req.headers.authorization !== `Bearer ${serviceToken}`) return send(res, 401, {});
            if (outage) return send(res, 503, {});
            const {host_sid} = await body(req);
            const session = sessions.get(host_sid);
            if (failNextRegistration) {
                failNextRegistration = false;
                // Ticket consumption has already completed; the following real auth signin
                // succeeds, then Redis rejects persistence of its new session binding.
                await registry.config('SET', 'maxmemory', '1');
            }
            return send(res, 200, {
                active: session?.active === true,
                datalens_access: session?.datalens_access === true,
            });
        }
        const bearer = req.headers.authorization?.replace(/^Bearer /, '');
        const entry = [...sessions.entries()].find(
            ([, session]) => session.bearer === bearer && session.active,
        );
        if (!entry) return send(res, 401, {});
        const [sid, session] = entry;
        if (path === '/session/logout' && req.method === 'POST') {
            session.active = false;
            return send(res, 200, {});
        }
        if (path === '/bi/ticket' && req.method === 'POST') {
            if (!session.datalens_access) return send(res, 403, {});
            const challenge = await body(req);
            if (
                ![challenge.transaction_id, challenge.nonce].every(
                    (value) => typeof value === 'string' && /^[\w-]{16,128}$/.test(value),
                )
            )
                return send(res, 400, {});
            const ticket = jwt.sign(
                {host_sid: sid, transaction_id: challenge.transaction_id, nonce: challenge.nonce},
                privateKey,
                {
                    algorithm: 'RS256',
                    header: {typ: 'datalens-sso+jwt', alg: 'RS256'},
                    issuer: 'test-host',
                    audience: 'test-datalens',
                    expiresIn: 60,
                    jwtid: randomUUID(),
                },
            );
            ticketsIssued += 1;
            return send(res, 200, {ticket});
        }
        return send(res, 404, {});
    } catch {
        return send(res, 500, {error: 'Test host request failed'});
    }
}).listen(8080, '0.0.0.0');
