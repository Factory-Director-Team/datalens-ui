/* Host-side integration. Load this file in the host application, not inside DataLens. */
window.DataLensSSO = class DataLensSSO {
    constructor({iframe, biOrigin, getTicket, onStatus = () => {}}) {
        const origin = new URL(biOrigin);
        if (origin.protocol !== 'https:' || origin.origin !== biOrigin) {
            throw new Error('biOrigin must be an HTTPS origin');
        }
        this.iframe = iframe;
        this.biOrigin = biOrigin;
        this.getTicket = getTicket;
        this.onStatus = onStatus;
        this.epoch = 0;
        this.state = 'closed';
        this.receive = this.receive.bind(this);
        window.addEventListener('message', this.receive);
    }

    open() {
        this.epoch += 1;
        this.state = 'opening';
        this.iframe.name = `datalens-${crypto.randomUUID()}`;
        this.iframe.hidden = false;
        this.iframe.src = `${this.biOrigin}/sso/bootstrap`;
    }

    // Call on host logout, account/session switch, or when unmounting the BI screen.
    close() {
        this.epoch += 1;
        this.state = 'closed';
        this.iframe.hidden = true;
        this.iframe.src = 'about:blank';
    }

    destroy() {
        this.close();
        window.removeEventListener('message', this.receive);
    }

    async receive(event) {
        if (event.origin !== this.biOrigin || event.source !== this.iframe.contentWindow) return;
        const message = event.data;
        if (!message || typeof message !== 'object' || message.version !== 1) return;
        if (message.type === 'datalens:sso:status') {
            const codes = [
                'SIGNED_OUT',
                'HOST_DENIED',
                'VERIFICATION_UNAVAILABLE',
                'SESSION_INVALID',
                'TICKET_INVALID',
                'AUTH_SERVICE_ERROR',
            ];
            if (!codes.includes(message.code) || this.state === 'closed') return;
            this.epoch += 1;
            this.state = 'stopped';
            this.onStatus(message.code);
            return;
        }
        if (message.type !== 'datalens:sso:challenge' || this.state !== 'opening') return;
        if (
            ![message.transaction_id, message.nonce].every(
                (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value),
            )
        )
            return;
        this.state = 'fetching';
        const epoch = this.epoch;
        try {
            const ticket = await this.getTicket({
                transaction_id: message.transaction_id,
                nonce: message.nonce,
            });
            if (epoch !== this.epoch || this.state !== 'fetching') return;
            if (typeof ticket !== 'string' || !ticket || ticket.length > 8192)
                throw new Error('Invalid ticket');
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `${this.biOrigin}/sso/callback`;
            form.target = this.iframe.name;
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'ticket';
            input.value = ticket;
            form.append(input);
            document.body.append(form);
            this.state = 'active';
            form.submit();
            form.remove();
        } catch (error) {
            if (epoch !== this.epoch) return;
            this.state = 'stopped';
            this.onStatus(
                ['HOST_DENIED', 'VERIFICATION_UNAVAILABLE'].includes(error?.code)
                    ? error.code
                    : 'HANDOFF_FAILED',
            );
        }
    }
};
