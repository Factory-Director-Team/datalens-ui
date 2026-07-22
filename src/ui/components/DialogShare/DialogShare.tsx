import React from 'react';

import {Button, CopyToClipboard, Dialog, Loader, Switch, TextInput} from '@gravity-ui/uikit';
import {toaster} from '@gravity-ui/uikit/toaster-singleton';
import block from 'bem-cn-lite';
import {I18n} from 'i18n';
import {Feature} from 'shared';
import {CLIPBOARD_TIMEOUT} from 'ui/constants/common';
import {getSdk} from 'ui/libs/schematic-sdk';
import type {DialogShareProps} from 'ui/registry/units/common/types/components/DialogShare';
import {isEnabledFeature} from 'ui/utils/isEnabledFeature';

import './DialogShare.scss';

const b = block('dl-dialog-share');
const i18n = I18n.keyset('component.dialog-share.view');

// Minimal Public link surface: a workbook editor flips a chart to public and copies the anonymous URL.
// The Share affordance is off by default and only appears when the operator enables the feature flag;
// switching it off makes the public URL fail closed (US stops serving the entry — ADR 0002).
export const DialogShare: React.FC<DialogShareProps> = (props) => {
    const {onClose, visible = true, propsData} = props;

    const entryId = propsData?.id;

    // Off by default (spec): the Public link mode is revealed only by operator configuration. We reuse
    // the existing EnableEmbedsInDialogShare flag that already gates this dialog from the chart menu
    // (getLinkMenuItem) rather than inventing a new one; a dedicated public-link flag is a later refinement.
    const isFeatureEnabled = isEnabledFeature(Feature.EnableEmbedsInDialogShare);

    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isPublic, setIsPublic] = React.useState<boolean | null>(null);

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

    const handleCopy = React.useCallback(() => {
        toaster.add({
            name: 'dialogShareLinkCopied',
            theme: 'success',
            title: i18n('toast_link-copied'),
        });
    }, []);

    // Feature disabled (default) or no saved entry to publish: keep the surface inert.
    if (!isFeatureEnabled || !entryId) {
        return null;
    }

    return (
        <Dialog open={visible} onClose={onClose} size="s">
            <Dialog.Header caption={i18n('label_title')} />
            <Dialog.Body>
                {isLoading ? (
                    <div className={b('loader')}>
                        <Loader size="m" />
                    </div>
                ) : (
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
                                <TextInput
                                    className={b('link-input')}
                                    disabled={true}
                                    value={publicUrl}
                                />
                                <CopyToClipboard
                                    text={publicUrl}
                                    timeout={CLIPBOARD_TIMEOUT}
                                    onCopy={handleCopy}
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
