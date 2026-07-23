import z from 'zod';

import {registerComponentId} from '../../../../components/public-api/utils';

import {embeddingSecretSchema} from './embedding-secret';

export const rotateEmbeddingSecretArgsSchema = z
    .object({
        workbookId: z
            .string()
            .describe('ID of the workbook whose embedding secret should be rotated.'),
    })
    .openapi(registerComponentId('RotateEmbeddingSecretArgs'), {
        title: 'RotateEmbeddingSecretArgs',
    });

// Rotating returns the refreshed secret (public key only) — every previously-issued embed token is now
// invalid (ADR 0003).
export const rotateEmbeddingSecretResultSchema = embeddingSecretSchema;
