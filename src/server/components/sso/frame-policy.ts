import type {Response} from '@gravity-ui/expresskit';

import type {SsoConfig} from './config';

export function framePolicy(res: Response, config: SsoConfig) {
    const existing = String(res.getHeader('Content-Security-Policy') || '');
    const policies = existing.replace(/(?:^|;)\s*frame-ancestors\s[^;]*/g, '');
    res.setHeader(
        'Content-Security-Policy',
        `${policies}; frame-ancestors 'self' ${(config.hostOrigins || [config.hostOrigin]).join(' ')}`,
    );
    res.removeHeader('X-Frame-Options');
}
