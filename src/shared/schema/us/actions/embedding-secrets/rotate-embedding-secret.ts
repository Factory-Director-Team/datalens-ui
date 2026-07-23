import {createTypedAction} from '../../../gateway-utils';
import {
    rotateEmbeddingSecretArgsSchema,
    rotateEmbeddingSecretResultSchema,
} from '../../schemas/embedding-secrets';

export const rotateEmbeddingSecret = createTypedAction(
    {
        paramsSchema: rotateEmbeddingSecretArgsSchema,
        resultSchema: rotateEmbeddingSecretResultSchema,
    },
    {
        method: 'POST',
        path: () => '/v1/embedding-secrets/rotate',
        params: (params, headers) => ({
            body: params,
            headers,
        }),
    },
);
