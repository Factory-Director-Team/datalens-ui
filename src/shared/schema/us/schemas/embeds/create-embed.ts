import z from 'zod';

import {registerComponentId} from '../../../../components/public-api/utils';

import {embedSchema, embedSettingsSchema} from './embed';

export const createEmbedArgsSchema = z
    .object({
        entryId: z.string().describe('ID of the entry to be privately embedded.'),
        title: z.string().optional().describe('Name of the embedding.'),
        // Optional: DataLens lazily creates the workbook Embedding secret on the first embed and signs
        // the token itself (ADR 0003), so the caller need not manage or pass a secret id.
        embeddingSecretId: z
            .string()
            .optional()
            .describe('ID of the key for embedding used for authentication.'),
        depsIds: z.array(z.string()).optional().describe('Array of dependency entry IDs.'),
        unsignedParams: z
            .array(z.string())
            .optional()
            .describe('Array of unsigned parameters to be provided in the embedding link.'),
        privateParams: z
            .array(z.string())
            .optional()
            .describe('Array of parameters locked away from the embedding URL.'),
        // Locked parameter values baked into the signed token and enforced as constants on render.
        signedParams: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('Locked parameter values signed into the token.'),
        publicParamsMode: z
            .boolean()
            .optional()
            .describe('Whether default parameters mode is enabled.'),
        settings: embedSettingsSchema.optional(),
    })
    .openapi(registerComponentId('CreateEmbedArgs'), {
        title: 'CreateEmbedArgs',
    });

// The create result is the Embed record plus the DataLens-signed token for the iframe snippet (ADR
// 0003) — the publisher never signs anything themselves.
export const createEmbedResultSchema = embedSchema
    .extend({
        token: z.string().describe('Signed RS256 Embed token for the iframe snippet.'),
    })
    .openapi(registerComponentId('CreateEmbedResult'), {
        title: 'CreateEmbedResult',
    });
