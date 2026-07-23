import type z from 'zod';

import type {
    embeddingSecretSchema,
    rotateEmbeddingSecretArgsSchema,
    rotateEmbeddingSecretResultSchema,
} from '../schemas/embedding-secrets';

export type EmbeddingSecret = z.infer<typeof embeddingSecretSchema>;

export type RotateEmbeddingSecretArgs = z.infer<typeof rotateEmbeddingSecretArgsSchema>;

export type RotateEmbeddingSecretResponse = z.infer<typeof rotateEmbeddingSecretResultSchema>;
