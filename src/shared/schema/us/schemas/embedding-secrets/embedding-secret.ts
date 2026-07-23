import z from 'zod';

import {registerComponentId} from '../../../../components/public-api/utils';

// Public projection of a workbook Embedding secret. The private key is never surfaced (ADR 0003).
export const embeddingSecretSchema = z
    .object({
        embeddingSecretId: z.string().describe('Unique identifier of the embedding secret.'),
        workbookId: z.string().describe('ID of the workbook the secret belongs to.'),
        title: z.string().describe('Name of the embedding secret.'),
        publicKey: z.string().describe('Public key used to validate embed tokens.'),
        createdBy: z.string().describe('ID of the user who created the embedding secret.'),
        createdAt: z.string().describe('Timestamp when the embedding secret was created.'),
    })
    .openapi(registerComponentId('EmbeddingSecret'), {
        title: 'EmbeddingSecret',
    });
