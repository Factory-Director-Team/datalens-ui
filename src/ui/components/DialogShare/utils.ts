import {stringify} from 'qs';

export type ShareUrlOptions = {
    origin: string;
    idPrefix?: string;
    id?: string;
    currentTab?: string;
    tabQueryName: string;
    initialParams?: Record<string, number | string>;
    noControls: boolean;
    hideComments: boolean;
    hideMenu: boolean;
    embedded?: boolean;
    paramNames: {
        noControls: string;
        hideComments: string;
        hideMenu: string;
        embedded: string;
    };
};

export const buildShareUrl = (options: ShareUrlOptions): string => {
    const {
        origin,
        idPrefix,
        id,
        currentTab,
        tabQueryName,
        initialParams,
        noControls,
        hideComments,
        hideMenu,
        embedded,
        paramNames,
    } = options;

    const prefix = idPrefix ?? '/';
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const path = `${normalizedPrefix}${id ?? ''}`;

    const query: Record<string, number | string> = {...(initialParams ?? {})};

    if (currentTab) {
        query[tabQueryName] = currentTab;
    }
    if (noControls) {
        query[paramNames.noControls] = 1;
    }
    if (hideComments) {
        query[paramNames.hideComments] = 1;
    }
    if (hideMenu) {
        query[paramNames.hideMenu] = 1;
    }
    if (embedded) {
        query[paramNames.embedded] = 1;
    }

    const search = stringify(query, {encode: true});
    const url = `${origin}${path}`;
    return search ? `${url}?${search}` : url;
};

export const buildIframeSnippet = (args: {url: string; width: string; height: string}): string => {
    const {url, width, height} = args;
    const escapedUrl = url.replace(/"/g, '&quot;');
    return `<iframe src="${escapedUrl}" width="${width}" height="${height}" frameborder="0"></iframe>`;
};
