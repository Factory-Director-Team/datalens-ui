import React from 'react';

import {
    Button,
    Checkbox,
    Dialog,
    SegmentedRadioGroup,
    Tab,
    TabList,
    TabPanel,
    TabProvider,
    TextArea,
    TextInput,
} from '@gravity-ui/uikit';
import block from 'bem-cn-lite';
import {I18n} from 'i18n';
import {URL_OPTIONS, URL_QUERY} from 'ui/constants';
import {URL_OPTIONS as CHARTKIT_URL_OPTIONS} from 'ui/libs/DatalensChartkit/modules/constants/constants';
import {copyTextWithToast} from 'ui/utils/copyText';

import type {DialogShareProps} from '../../registry/units/common/types/components/DialogShare';

import {buildIframeSnippet, buildShareUrl} from './utils';

import './DialogShare.scss';

const b = block('dl-dialog-share');
const i18n = I18n.keyset('component.dialog-share');

const HIDE_MENU_PARAM = '_hide_menu';

const DEFAULT_WIDTH = '800';
const DEFAULT_HEIGHT = '600';

type TabId = 'link' | 'iframe';

const getEntryId = (props: DialogShareProps): string | undefined => {
    const propsData = props.propsData as {id?: string} | undefined;
    if (propsData?.id) {
        return propsData.id;
    }
    const loadedData = props.loadedData as {entryId?: string} | undefined;
    return loadedData?.entryId;
};

const hasInitialValue = (params: Record<string, number> | undefined, key: string): boolean => {
    if (!params) {
        return false;
    }
    const value = params[key];
    return value === 1 || (value as unknown as string) === '1';
};

export const DialogShare: React.FC<DialogShareProps> = (props) => {
    const {
        onClose,
        visible,
        urlIdPrefix,
        initialParams,
        hasDefaultSize,
        withLinkDescription,
        withHideComments,
        withSelectors,
        withFederation,
        withEmbedLink,
        withHideMenu,
        withCopyAndExitBtn,
        currentTab,
    } = props;

    const entryId = getEntryId(props);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const [activeTab, setActiveTab] = React.useState<TabId>('link');

    const [noControls, setNoControls] = React.useState<boolean>(
        hasInitialValue(initialParams, URL_OPTIONS.NO_CONTROLS),
    );
    const [hideComments, setHideComments] = React.useState<boolean>(
        hasInitialValue(initialParams, CHARTKIT_URL_OPTIONS.HIDE_COMMENTS),
    );
    const [hideMenu, setHideMenu] = React.useState<boolean>(
        hasInitialValue(initialParams, HIDE_MENU_PARAM),
    );

    const [sizeMode, setSizeMode] = React.useState<'auto' | 'custom'>(
        hasDefaultSize ? 'custom' : 'auto',
    );
    const [width, setWidth] = React.useState<string>(DEFAULT_WIDTH);
    const [height, setHeight] = React.useState<string>(DEFAULT_HEIGHT);

    const isEmbedTabAvailable = withEmbedLink !== false;

    const linkUrl = React.useMemo(
        () =>
            buildShareUrl({
                origin,
                idPrefix: urlIdPrefix,
                id: entryId,
                currentTab,
                tabQueryName: URL_QUERY.TAB_ID,
                initialParams,
                noControls,
                hideComments,
                hideMenu,
                embedded: false,
                paramNames: {
                    noControls: URL_OPTIONS.NO_CONTROLS,
                    hideComments: CHARTKIT_URL_OPTIONS.HIDE_COMMENTS,
                    hideMenu: HIDE_MENU_PARAM,
                    embedded: URL_OPTIONS.EMBEDDED,
                },
            }),
        [
            origin,
            urlIdPrefix,
            entryId,
            currentTab,
            initialParams,
            noControls,
            hideComments,
            hideMenu,
        ],
    );

    const iframeUrl = React.useMemo(
        () =>
            buildShareUrl({
                origin,
                idPrefix: urlIdPrefix,
                id: entryId,
                currentTab,
                tabQueryName: URL_QUERY.TAB_ID,
                initialParams,
                noControls,
                hideComments,
                hideMenu,
                embedded: true,
                paramNames: {
                    noControls: URL_OPTIONS.NO_CONTROLS,
                    hideComments: CHARTKIT_URL_OPTIONS.HIDE_COMMENTS,
                    hideMenu: HIDE_MENU_PARAM,
                    embedded: URL_OPTIONS.EMBEDDED,
                },
            }),
        [
            origin,
            urlIdPrefix,
            entryId,
            currentTab,
            initialParams,
            noControls,
            hideComments,
            hideMenu,
        ],
    );

    const iframeSnippet = React.useMemo(
        () =>
            buildIframeSnippet({
                url: iframeUrl,
                width: sizeMode === 'auto' ? '100%' : width,
                height: sizeMode === 'auto' ? '100%' : height,
            }),
        [iframeUrl, sizeMode, width, height],
    );

    const copyToClipboard = React.useCallback((text: string) => {
        copyTextWithToast({
            copyText: text,
            toastName: 'dl-dialog-share-copy',
            successText: i18n('toast-copied'),
            errorText: i18n('toast-copy-failed'),
        });
    }, []);

    const handleCopyCurrent = React.useCallback(() => {
        copyToClipboard(activeTab === 'iframe' ? iframeSnippet : linkUrl);
    }, [activeTab, iframeSnippet, linkUrl, copyToClipboard]);

    const handleCopyAndClose = React.useCallback(() => {
        handleCopyCurrent();
        onClose();
    }, [handleCopyCurrent, onClose]);

    const titleKey = activeTab === 'iframe' ? 'title-embed' : 'title-share';

    const renderOptions = () => (
        <div className={b('section')}>
            <div className={b('section-title')}>{i18n('section-options')}</div>
            <div className={b('options')}>
                <Checkbox checked={noControls} onUpdate={setNoControls} size="l">
                    {i18n('option-no-controls')}
                </Checkbox>
                {withHideComments ? (
                    <Checkbox checked={hideComments} onUpdate={setHideComments} size="l">
                        {i18n('option-hide-comments')}
                    </Checkbox>
                ) : null}
                {withHideMenu ? (
                    <Checkbox checked={hideMenu} onUpdate={setHideMenu} size="l">
                        {i18n('option-hide-menu')}
                    </Checkbox>
                ) : null}
            </div>
        </div>
    );

    const renderLinkPanel = () => (
        <div className={b('panel')}>
            {renderOptions()}
            <div className={b('section')}>
                <div className={b('section-title')}>{i18n('label-url')}</div>
                <div className={b('value-row')}>
                    <TextArea className={b('value-textarea')} value={linkUrl} readOnly rows={2} />
                    <Button view="action" onClick={() => copyToClipboard(linkUrl)}>
                        {i18n('button-copy')}
                    </Button>
                </div>
                {withLinkDescription ? (
                    <div className={b('hint')}>{i18n('link-description')}</div>
                ) : null}
                {withFederation ? (
                    <div className={b('federation-hint')}>{i18n('federation-hint')}</div>
                ) : null}
            </div>
        </div>
    );

    const renderIframePanel = () => (
        <div className={b('panel')}>
            {renderOptions()}
            <div className={b('section')}>
                <div className={b('section-title')}>{i18n('section-size')}</div>
                <div className={b('size-row')}>
                    <SegmentedRadioGroup
                        value={sizeMode}
                        onUpdate={(value) => setSizeMode(value as 'auto' | 'custom')}
                    >
                        <SegmentedRadioGroup.Option value="auto">
                            {i18n('size-auto')}
                        </SegmentedRadioGroup.Option>
                        <SegmentedRadioGroup.Option value="custom">
                            {i18n('size-custom')}
                        </SegmentedRadioGroup.Option>
                    </SegmentedRadioGroup>
                    {sizeMode === 'custom' ? (
                        <React.Fragment>
                            <TextInput
                                className={b('size-input')}
                                value={width}
                                onUpdate={setWidth}
                                label={i18n('label-width')}
                                size="m"
                            />
                            <TextInput
                                className={b('size-input')}
                                value={height}
                                onUpdate={setHeight}
                                label={i18n('label-height')}
                                size="m"
                            />
                        </React.Fragment>
                    ) : null}
                </div>
            </div>
            <div className={b('section')}>
                <div className={b('section-title')}>{i18n('label-iframe')}</div>
                <div className={b('value-row')}>
                    <TextArea
                        className={b('value-textarea')}
                        value={iframeSnippet}
                        readOnly
                        rows={3}
                    />
                    <Button view="action" onClick={() => copyToClipboard(iframeSnippet)}>
                        {i18n('button-copy')}
                    </Button>
                </div>
                {withFederation ? (
                    <div className={b('federation-hint')}>{i18n('federation-hint')}</div>
                ) : null}
            </div>
        </div>
    );

    // Reference withSelectors to avoid unused-var lint while keeping the prop in the API.
    // The option label is shared for both "controls" and "selectors" by design.
    void withSelectors;

    return (
        <Dialog open={visible ?? true} onClose={onClose} size="m">
            <Dialog.Header caption={i18n(titleKey)} />
            <Dialog.Body>
                <div className={b()}>
                    {isEmbedTabAvailable ? (
                        <TabProvider
                            value={activeTab}
                            onUpdate={(value) => setActiveTab(value as TabId)}
                        >
                            <TabList className={b('tabs')}>
                                <Tab value="link">{i18n('tab-link')}</Tab>
                                <Tab value="iframe">{i18n('tab-iframe')}</Tab>
                            </TabList>
                            <TabPanel value="link">{renderLinkPanel()}</TabPanel>
                            <TabPanel value="iframe">{renderIframePanel()}</TabPanel>
                        </TabProvider>
                    ) : (
                        renderLinkPanel()
                    )}
                </div>
            </Dialog.Body>
            <Dialog.Footer
                onClickButtonCancel={onClose}
                textButtonCancel={i18n('button-close')}
                preset="default"
                onClickButtonApply={withCopyAndExitBtn ? handleCopyAndClose : undefined}
                textButtonApply={withCopyAndExitBtn ? i18n('button-copy-and-close') : undefined}
            />
        </Dialog>
    );
};
