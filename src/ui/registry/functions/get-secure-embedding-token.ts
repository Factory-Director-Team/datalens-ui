import {DL} from 'ui/constants/common';

// The client-side token-retrieval hook (opensource). On an anonymous Embed page the signed token is
// served in DL.embedToken; the data provider reads it here and attaches it to chart runs as the
// x-dl-embed-token header, which US validates before returning the (private) object (ticket 04).
export const getSecureEmbeddingToken = (): string => DL.EMBED_TOKEN;
