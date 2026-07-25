export function getEntryNameByKey({key, index = -1}: {key: string | null; index?: number}) {
    let name = '';

    if (key && typeof key === 'string') {
        let pathSplit = key.split('/');
        pathSplit = pathSplit.filter(Boolean);

        if (pathSplit.length !== 0) {
            name = pathSplit.splice(index, 1)[0];
        }
    }

    return name;
}

// The folder an entry lives in, derived from its key. A key is not always there to derive from — an
// entry read anonymously is served without one — so, like getEntryNameByKey above, this answers for a
// missing key instead of throwing: the root is the only navigation target left.
export function getNavigationPathByKey({key}: {key: string | null | undefined}) {
    if (!key) {
        return '/';
    }

    // an empty string is considered a valid value, but it does not pass Boolean verification, so we replace it with '/'
    return key.replace(/\/?[^/]*$/g, '') || '/';
}

export function normalizeDestination(destination = '') {
    // Delete extreme slashes, and add one to the right
    return destination.replace(/^\/+|\/+$/g, '') + '/';
}

export function isUsersFolder(key = '') {
    return key.toLowerCase() === 'users/';
}
