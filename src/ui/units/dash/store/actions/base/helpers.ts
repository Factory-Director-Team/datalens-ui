import type {StringParams} from '@gravity-ui/chartkit/highcharts';
import type {
    ItemsStateAndParams,
    ItemsStateAndParamsBase,
    QueueItem,
} from '@gravity-ui/dashkit/helpers';
import {getNavigationPathByKey} from 'shared/modules/entry';
import type {DashData, DashEntry, Permissions} from 'shared/types';
import {DashTabItemType} from 'shared/types';
import {
    isGlobalWidgetVisibleByMainSetting,
    isGroupItemVisibleOnTab,
} from 'ui/units/dash/utils/selectors';

import type {DashState} from '../../typings/dash';
import {createNewTabState} from '../../utils';
import type {TabsHashStates} from '../dashTyped';

// A dashboard opened anonymously — through a public link or an Embed — can only ever be viewed: there is
// no session behind the request, and the edit chrome is not rendered.
const ANONYMOUS_PERMISSIONS: Permissions = {
    execute: true,
    read: true,
    edit: false,
    admin: false,
};

// The dashboard entry as a read hands it over. An anonymous read returns a deliberately reduced envelope
// — the Embed read returns entryId, scope and data only — so nothing here can be assumed present.
export type LoadedDashEntry = Partial<DashEntry> & {permissions?: Permissions};

export type EntryStateFields = Pick<DashState, 'navigationPath' | 'permissions' | 'annotation'> & {
    // Not part of DashState — the load payload has carried it for the entry-content store since before
    // this helper; kept here so every entry-derived field of that payload is resolved in one place.
    currentRevId: string | null;
};

// The fields of the dash load payload that come from the entry envelope rather than from the dashboard
// data. The anonymous reads serve a reduced envelope — the Embed read returns entryId, scope and data
// only, so that no personal information (key, author, permissions) leaks to a page on any origin — so
// what an anonymous page reports for each of these is stated here instead of being left to whatever the
// read happened to omit.
export const getEntryStateFields = ({
    entry,
    isAnonymous,
}: {
    entry: LoadedDashEntry;
    isAnonymous: boolean;
}): EntryStateFields => ({
    // An anonymous page has no navigation to return to (no aside header, no navigation dialogs), and the
    // Embed entry carries no key to derive a path from anyway.
    navigationPath: isAnonymous ? null : getNavigationPathByKey({key: entry.key}),
    // View-only regardless of what the read returned: an anonymous viewer has no session to edit with.
    permissions: isAnonymous ? ANONYMOUS_PERMISSIONS : entry.permissions,
    // Carried when the read provides it (a public link does), absent otherwise (an Embed does not) —
    // an Embed shows no dashboard description.
    annotation: entry.annotation ?? null,
    // An anonymous page always serves the published revision and offers no revision switching.
    currentRevId: entry.revId ?? null,
});

const buildParamsStateFromQueue = (
    actualTabQueue: QueueItem[],
    paramsState: ItemsStateAndParamsBase,
): ItemsStateAndParamsBase => {
    const actualTabParams: ItemsStateAndParamsBase = {};

    actualTabQueue.forEach((queueItem) => {
        if (queueItem.groupItemId) {
            const paramsFromState = paramsState?.[queueItem.id].params?.[queueItem.groupItemId] as
                | StringParams
                | undefined;

            if (paramsFromState) {
                const existingItem = actualTabParams[queueItem.id];
                if (existingItem?.params) {
                    existingItem.params[queueItem.groupItemId] = paramsFromState;
                } else {
                    actualTabParams[queueItem.id] = {
                        params: {[queueItem.groupItemId]: paramsFromState},
                    };
                }
            }
        } else {
            const paramsFromState = paramsState?.[queueItem.id].params;

            if (paramsFromState) {
                actualTabParams[queueItem.id] = {
                    params: paramsFromState,
                };
            }
        }
    });

    return actualTabParams;
};

const processTabForGlobalStates = (
    tab: DashData['tabs'][0],
    currentStateQueue: QueueItem[],
    paramsState: ItemsStateAndParamsBase,
): {state: ItemsStateAndParams; hash: undefined} | null => {
    const tabGlobalItemsIds = new Set<string>();

    tab.globalItems?.forEach((item) => {
        if (item.type === DashTabItemType.GroupControl) {
            const isGroupSettingApplied = isGlobalWidgetVisibleByMainSetting(
                tab.id,
                item.data.impactType,
                item.data.impactTabsIds,
            );
            item.data.group.forEach((groupItem) => {
                if (
                    isGroupItemVisibleOnTab({
                        item: groupItem,
                        tabId: tab.id,
                        isVisibleByMainSetting: isGroupSettingApplied,
                    })
                ) {
                    tabGlobalItemsIds.add(groupItem.id);
                }
            });
        } else {
            tabGlobalItemsIds.add(item.id);
        }
    });

    if (!tabGlobalItemsIds.size) {
        return null;
    }

    const actualTabQueue: QueueItem[] = currentStateQueue.filter((item) =>
        item.groupItemId ? tabGlobalItemsIds.has(item.groupItemId) : tabGlobalItemsIds.has(item.id),
    );

    if (actualTabQueue.length === 0) {
        return null;
    }

    const actualTabParams = buildParamsStateFromQueue(actualTabQueue, paramsState);
    const newTabHashState = createNewTabState(actualTabParams, actualTabQueue);

    return {
        state: newTabHashState,
        hash: undefined,
    };
};

export const getGlobalStatesForInactiveTabs = ({
    state,
    data,
    currentTabId,
}: {
    state?: ItemsStateAndParams;
    data: DashData;
    currentTabId: string | null;
}) => {
    return new Promise((resolve) => {
        const currentStateQueue =
            state?.__meta__ && 'queue' in state.__meta__ ? state.__meta__.queue : null;

        if (!currentStateQueue || !currentStateQueue?.length) {
            resolve(null);
            return;
        }

        let hasUpdates = false;
        const updatedHashStates: TabsHashStates = {};
        const paramsState = state as ItemsStateAndParamsBase;

        for (const tab of data.tabs) {
            // skip the current tab, as its state is updated separately in the general order
            if (tab.id === currentTabId || tab.globalItems?.length === 0) {
                continue;
            }

            const tabResult = processTabForGlobalStates(tab, currentStateQueue, paramsState);

            if (tabResult) {
                updatedHashStates[tab.id] = tabResult;
                hasUpdates = true;
            }
        }

        if (hasUpdates) {
            resolve(updatedHashStates);
            return;
        }

        resolve(null);
    });
};
