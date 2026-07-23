import type {EmbeddingInfo} from '../../components/storage/types';
import {filterParams} from '../embeds';

// Ticket 04 — the URL-parameter merge that enforces an Embed's locked/open contract at render time.
// The authoritative token validation + locked/open config live in the US integration seam; this covers
// the BFF's side: which incoming (iframe URL) params are honored vs. ignored, and that the token's
// locked params win.
const makeEmbeddingInfo = (
    embed: Partial<EmbeddingInfo['embed']>,
    tokenParams?: Record<string, unknown>,
): EmbeddingInfo =>
    ({
        token: {embedId: 'e1', iat: 0, exp: 0, params: tokenParams},
        embed: {
            embedId: 'e1',
            title: 'Embed',
            embeddingSecretId: 's1',
            entryId: 'entry1',
            depsIds: [],
            unsignedParams: [],
            privateParams: [],
            publicParamsMode: true,
            settings: {},
            ...embed,
        },
        entry: {} as EmbeddingInfo['entry'],
    }) as EmbeddingInfo;

describe('embeds filterParams', () => {
    test('publicParamsMode: only the unsigned allowlist is honored from the URL, the rest are ignored', async () => {
        const embeddingInfo = makeEmbeddingInfo({
            publicParamsMode: true,
            unsignedParams: ['open'],
        });

        const {params} = await filterParams({
            params: {open: 'fromUrl', secret: 'shouldBeDropped'},
            embeddingInfo,
        });

        expect(params).toEqual({open: 'fromUrl'});
        expect(params).not.toHaveProperty('secret');
    });

    test('token (locked) params are enforced and win over the incoming URL params', async () => {
        const embeddingInfo = makeEmbeddingInfo(
            {publicParamsMode: true, unsignedParams: ['open', 'locked']},
            {locked: 'fromToken'},
        );

        const {params} = await filterParams({
            params: {open: 'fromUrl', locked: 'tamperedFromUrl'},
            embeddingInfo,
        });

        // The open param passes; the locked one is forced back to the token's constant value.
        expect(params.open).toBe('fromUrl');
        expect(params.locked).toBe('fromToken');
    });

    test('with no incoming params, only the token (locked) params are applied', async () => {
        const embeddingInfo = makeEmbeddingInfo(
            {publicParamsMode: true, unsignedParams: ['open']},
            {locked: 'fromToken'},
        );

        const {params} = await filterParams({params: {}, embeddingInfo});

        expect(params).toEqual({locked: 'fromToken'});
    });

    test('privateParams (blocklist) mode: forbidden params are dropped, others pass', async () => {
        const embeddingInfo = makeEmbeddingInfo({
            publicParamsMode: false,
            privateParams: ['secret'],
        });

        const {params, privateParams} = await filterParams({
            params: {open: 'fromUrl', secret: 'shouldBeDropped'},
            embeddingInfo,
        });

        expect(params.open).toBe('fromUrl');
        expect(params).not.toHaveProperty('secret');
        expect(privateParams?.has('secret')).toBe(true);
    });
});
