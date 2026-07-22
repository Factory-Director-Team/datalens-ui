import React from 'react';

import {
    Button,
    CopyToClipboard,
    Dialog,
    Loader,
    SegmentedRadioGroup as RadioButton,
    Switch,
    TextArea,
    TextInput,
} from '@gravity-ui/uikit';
import {toaster} from '@gravity-ui/uikit/toaster-singleton';
import block from 'bem-cn-lite';
import {I18n} from 'i18n';
import {DL_EMBED_TOKEN_SEARCH_PARAM, Feature} from 'shared';
import {CLIPBOARD_TIMEOUT} from 'ui/constants/common';
import {getSdk} from 'ui/libs/schematic-sdk';
import type {DialogShareProps} from 'ui/registry/units/common/types/components/DialogShare';
import {isEnabledFeature} from 'ui/utils/isEnabledFeature';

import './DialogShare.scss';

const b = block('dl-dialog-share');
const i18n = I18n.keyset('component.dialog-share.view');

// Default iframe box for the copy-paste snippet; the embedder can adjust it in their page.
const EMBED_IFRAME_WIDTH = '100%';
const EMBED_IFRAME_HEIGHT = '400';

type ShareMode = 'public' | 'embed';

// Share dialog: a workbook editor either flips a chart to a Public link (variant C) or creates an
// Embed (variant B) — a private, token-scoped embedding that renders anonymously in any page's iframe.
// The Share affordance is off by default and only appears when the operator enables the feature flag.
export const DialogShare: React.FC<DialogShareProps> = (props) => {
    const {onClose, visible = true, propsData, initialParams} = props;

    const entryId = propsData?.id;

    // Off by default (spec): the Share surface is revealed only by operator configuration. We reuse the
    // existing EnableEmbedsInDialogShare flag that already gates this dialog from the chart menu.
    const isFeatureEnabled = isEnabledFeature(Feature.EnableEmbedsInDialogShare);

    const [mode, setMode] = React.useState<ShareMode>('public');
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isPublic, setIsPublic] = React.useState<boolean | null>(null);

    // The chart's current parameters — the publisher marks each as locked (baked into the token and
    // enforced) or left open (passable through the iframe URL).
    const chartParams = React.useMemo<Record<string, unknown>>(() => {
        const fromProps = (propsData as {params?: Record<string, unknown>} | undefined)?.params;
        return {...(initialParams ?? {}), ...(fromProps ?? {})};
    }, [propsData, initialParams]);
    const paramNames = React.useMemo(() => Object.keys(chartParams), [chartParams]);

    const [lockedParams, setLockedParams] = React.useState<Record<string, boolean>>({});
    const [isCreatingEmbed, setIsCreatingEmbed] = React.useState(false);
    const [embedToken, setEmbedToken] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isFeatureEnabled || !entryId) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        getSdk()
            .sdk.us.getEntry({entryId})
            .then((entry) => {
                if (!cancelled) {
                    setIsPublic(entry.public);
                    setIsLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setIsLoading(false);
                    toaster.add({
                        name: 'dialogShareLoadFailed',
                        theme: 'danger',
                        title: i18n('label_loading-failed'),
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [entryId, isFeatureEnabled]);

    const publicUrl = React.useMemo(
        () => (entryId ? `${window.location.origin}/public/${entryId}` : ''),
        [entryId],
    );

    const embedSnippet = React.useMemo(
        () =>
            embedToken
                ? `<iframe src="${window.location.origin}/embed?${DL_EMBED_TOKEN_SEARCH_PARAM}=${embedToken}" width="${EMBED_IFRAME_WIDTH}" height="${EMBED_IFRAME_HEIGHT}" frameborder="0"></iframe>`
                : '',
        [embedToken],
    );

    const handleToggle = React.useCallback(
        (nextValue: boolean) => {
            if (!entryId) {
                return;
            }

            setIsSaving(true);

            getSdk()
                .sdk.us.switchEntryPublicationStatus({entryId, publish: nextValue})
                .then((response) => {
                    setIsPublic(response.public);
                    setIsSaving(false);
                    toaster.add({
                        name: 'dialogSharePublicationSuccess',
                        theme: 'success',
                        title: i18n('toast_publication-success'),
                    });
                })
                .catch(() => {
                    setIsSaving(false);
                    toaster.add({
                        name: 'dialogSharePublicationFailed',
                        theme: 'danger',
                        title: i18n('toast_publication-failed'),
                    });
                });
        },
        [entryId],
    );

    const handleLockParam = React.useCallback((name: string, locked: boolean) => {
        setLockedParams((prev) => ({...prev, [name]: locked}));
        // The current token no longer reflects the chosen parameter split — force a regenerate.
        setEmbedToken(null);
    }, []);

    const handleCreateEmbed = React.useCallback(() => {
        if (!entryId) {
            return;
        }

        // Locked parameters ride in the signed token (enforced); the rest form the open allowlist the
        // iframe URL may override. US/BFF enforce exactly this split at render time (ADR 0003).
        const unsignedParams = paramNames.filter((name) => !lockedParams[name]);
        const signedParams = paramNames.reduce<Record<string, unknown>>((acc, name) => {
            if (lockedParams[name]) {
                acc[name] = chartParams[name];
            }
            return acc;
        }, {});

        setIsCreatingEmbed(true);

        getSdk()
            .sdk.us.createEmbed({
                entryId,
                unsignedParams,
                privateParams: paramNames.filter((name) => lockedParams[name]),
                signedParams,
                publicParamsMode: true,
            })
            .then((response) => {
                setEmbedToken(response.token);
                setIsCreatingEmbed(false);
                toaster.add({
                    name: 'dialogShareEmbedCreated',
                    theme: 'success',
                    title: i18n('toast_embed-created'),
                });
            })
            .catch(() => {
                setIsCreatingEmbed(false);
                toaster.add({
                    name: 'dialogShareEmbedFailed',
                    theme: 'danger',
                    title: i18n('toast_embed-failed'),
                });
            });
    }, [entryId, paramNames, lockedParams, chartParams]);

    const handleCopy = React.useCallback(
        (titleKey: 'toast_link-copied' | 'toast_snippet-copied') => {
            toaster.add({
                name: 'dialogShareCopied',
                theme: 'success',
                title: i18n(titleKey),
            });
        },
        [],
    );

    // Feature disabled (default) or no saved entry to share: keep the surface inert.
    if (!isFeatureEnabled || !entryId) {
        return null;
    }

    const renderPublicMode = () => (
        <div className={b()}>
            <div className={b('row')}>
                <Switch
                    checked={Boolean(isPublic)}
                    disabled={isSaving}
                    onUpdate={handleToggle}
                    content={i18n('label_public-link')}
                />
            </div>
            <div className={b('hint')}>{i18n('label_public-link-hint')}</div>
            {isPublic && (
                <div className={b('link-row')}>
                    <TextInput className={b('link-input')} disabled={true} value={publicUrl} />
                    <CopyToClipboard
                        text={publicUrl}
                        timeout={CLIPBOARD_TIMEOUT}
                        onCopy={() => handleCopy('toast_link-copied')}
                    >
                        {() => (
                            <Button view="outlined" className={b('copy-button')}>
                                {i18n('button_copy')}
                            </Button>
                        )}
                    </CopyToClipboard>
                </div>
            )}
        </div>
    );

    const renderEmbedMode = () => (
        <div className={b()}>
            <div className={b('hint')}>{i18n('label_embed-hint')}</div>
            {paramNames.length > 0 ? (
                <div className={b('params')}>
                    <div className={b('params-title')}>{i18n('label_lock-params')}</div>
                    {paramNames.map((name) => (
                        <div key={name} className={b('param-row')}>
                            <Switch
                                checked={Boolean(lockedParams[name])}
                                onUpdate={(checked) => handleLockParam(name, checked)}
                                content={name}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className={b('hint')}>{i18n('label_no-params')}</div>
            )}
            <div className={b('row')}>
                <Button
                    view="action"
                    loading={isCreatingEmbed}
                    onClick={handleCreateEmbed}
                    className={b('create-button')}
                >
                    {embedToken ? i18n('button_regenerate-embed') : i18n('button_create-embed')}
                </Button>
            </div>
            {embedToken && (
                <div className={b('snippet')}>
                    <TextArea value={embedSnippet} readOnly={true} rows={3} />
                    <CopyToClipboard
                        text={embedSnippet}
                        timeout={CLIPBOARD_TIMEOUT}
                        onCopy={() => handleCopy('toast_snippet-copied')}
                    >
                        {() => (
                            <Button view="outlined" className={b('copy-button')} width="max">
                                {i18n('button_copy-snippet')}
                            </Button>
                        )}
                    </CopyToClipboard>
                </div>
            )}
        </div>
    );

    return (
        <Dialog open={visible} onClose={onClose} size="s">
            <Dialog.Header caption={i18n('label_title')} />
            <Dialog.Body>
                {isLoading ? (
                    <div className={b('loader')}>
                        <Loader size="m" />
                    </div>
                ) : (
                    <React.Fragment>
                        <RadioButton
                            className={b('mode')}
                            value={mode}
                            onUpdate={(value) => setMode(value as ShareMode)}
                            width="max"
                        >
                            <RadioButton.Option
                                content={i18n('label_mode-public')}
                                value="public"
                            />
                            <RadioButton.Option content={i18n('label_mode-embed')} value="embed" />
                        </RadioButton>
                        {mode === 'public' ? renderPublicMode() : renderEmbedMode()}
                    </React.Fragment>
                )}
            </Dialog.Body>
            <Dialog.Footer
                textButtonApply={i18n('button_close')}
                onClickButtonApply={onClose}
                propsButtonApply={{view: 'flat'}}
            />
        </Dialog>
    );
};

export default DialogShare;
