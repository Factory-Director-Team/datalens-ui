import Redis from 'ioredis';

export type SessionBinding = {
    kind: 'native' | 'sso';
    userId: string;
    hostSessionId?: string;
    issuer?: string;
    expiresAt: number;
    revoked?: boolean;
};

export type Transaction = {browserHash: string; nonce: string};

const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

/** Use a dedicated durable Redis primary (AOF always, no eviction); never a cache replica. */
export class SsoStore {
    private readonly redis: Redis.Redis;

    constructor(url: string) {
        this.redis = new Redis(url, {
            connectTimeout: 1500,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        });
        // Callers turn storage failures into a controlled 503. Never log connection credentials.
        this.redis.on('error', () => {});
    }

    async createTransaction(id: string, transaction: Transaction) {
        await this.redis.set(
            `dl:sso:transaction:${id}`,
            JSON.stringify(transaction),
            'EX',
            120,
            'NX',
        );
    }

    async consumeTransaction(
        id: string,
        transaction: Transaction,
        ticketId: string,
    ): Promise<boolean> {
        const result = await this.redis.eval(
            `local stored = redis.call('GET', KEYS[1])
             if not stored then return 0 end
             local t = cjson.decode(stored)
             if t.browserHash ~= ARGV[1] or t.nonce ~= ARGV[2] then return 0 end
             if not redis.call('SET', KEYS[2], 'used', 'NX', 'EX', 120) then return 0 end
             redis.call('DEL', KEYS[1])
             return 1`,
            2,
            `dl:sso:transaction:${id}`,
            `dl:sso:ticket:${ticketId}`,
            transaction.browserHash,
            transaction.nonce,
        );
        return result === 1;
    }

    async register(id: string, binding: Omit<SessionBinding, 'expiresAt'>) {
        const result = await this.redis.set(
            `dl:sso:session:${id}`,
            JSON.stringify({...binding, expiresAt: Date.now() + SESSION_LIFETIME_SECONDS * 1000}),
            'EX',
            SESSION_LIFETIME_SECONDS + 86400,
            'NX',
        );
        if (result !== 'OK') {
            throw new Error('Session provenance already exists');
        }
    }

    async get(id: string): Promise<SessionBinding | undefined> {
        const result = await this.redis.get(`dl:sso:session:${id}`);
        return result ? JSON.parse(result) : undefined;
    }

    async revoke(id: string) {
        await this.redis.eval(
            `local value = redis.call('GET', KEYS[1])
             if value then
                 local binding = cjson.decode(value)
                 binding.revoked = true
                 redis.call('SET', KEYS[1], cjson.encode(binding), 'KEEPTTL')
             end
             return 1`,
            1,
            `dl:sso:session:${id}`,
        );
    }
}
