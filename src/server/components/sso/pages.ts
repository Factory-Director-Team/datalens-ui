import {randomBytes} from 'crypto';

import type {Response} from '@gravity-ui/expresskit';

import type {SsoConfig} from './config';

function scriptJson(value: unknown) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function framePolicy(res: Response, config: SsoConfig) {
    const existing = String(res.getHeader('Content-Security-Policy') || '');
    const policies = existing.replace(/(?:^|;)\s*frame-ancestors\s[^;]*/g, '');
    res.setHeader(
        'Content-Security-Policy',
        `${policies}; frame-ancestors 'self' ${config.hostOrigin}`,
    );
    res.removeHeader('X-Frame-Options');
}

export function sendSsoPage(
    res: Response,
    config: SsoConfig,
    status: number,
    code: string,
    challenge?: {transaction_id: string; nonce: string},
) {
    const messages: Record<string, string> = {
        BOOTSTRAP: 'Выполняется вход в DataLens…',
        SIGNED_OUT:
            'Вы вышли из DataLens. Для повторного входа нажмите «Открыть DataLens» в приложении.',
        HOST_DENIED: 'Доступ к DataLens отозван или сессия приложения завершена.',
        VERIFICATION_UNAVAILABLE: 'Проверка доступа временно недоступна. Повторите попытку позже.',
        SESSION_INVALID:
            'Сессия DataLens завершена. Откройте DataLens заново или войдите по паролю.',
        TICKET_INVALID: 'Не удалось подтвердить вход. Откройте DataLens заново.',
        AUTH_SERVICE_ERROR: 'Не удалось войти в DataLens. Обратитесь к администратору.',
    };
    const nonce = randomBytes(24).toString('base64');
    const message = challenge
        ? {type: 'datalens:sso:challenge', version: 1, ...challenge}
        : {type: 'datalens:sso:status', version: 1, code};
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'self' ${config.hostOrigin}; base-uri 'none'; form-action 'self'`,
    );
    res.status(status)
        .type('html')
        .send(
            `<!doctype html><html lang="ru"><meta charset="utf-8"><title>DataLens</title><body><main><h1>DataLens</h1><p>${messages[code] || messages.SESSION_INVALID}</p><a href="/auth/signin">Войти по логину и паролю</a></main><script nonce="${nonce}">if (window.parent !== window) window.parent.postMessage(${scriptJson(message)}, ${scriptJson(config.hostOrigin)});</script></body></html>`,
        );
}
