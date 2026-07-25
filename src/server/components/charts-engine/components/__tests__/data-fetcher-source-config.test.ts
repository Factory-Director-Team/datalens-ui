import {AppEnvironment} from '../../../../../shared';
import opensourceConfig from '../../../../configs/opensource/common';
import type {SourceConfig} from '../../types';
import {DataFetcher, EMBED_SOURCE_NAME_BY_SOURCE} from '../processor/data-fetcher';

// Issue 09: an embed run reroutes a dataset/connection source to its `_embed` variant, which the
// opensource installation serves no endpoint for. See DataFetcher.getSourceConfig for what that
// costs when the variant is taken regardless.

const embedDetourSources = Object.keys(EMBED_SOURCE_NAME_BY_SOURCE);
const sourcePathOf = (sourceName: string) => `/_${sourceName}/entry-id/result`;

describe('DataFetcher.getSourceConfig: sources an embed run resolves', () => {
    describe.each([AppEnvironment.Production, AppEnvironment.Development])(
        'opensource installation, %s',
        (appEnv) => {
            const sourcesConfig = opensourceConfig.getSourcesByEnv(appEnv);

            test.each(embedDetourSources)(
                'an embed run on %s resolves to a usable data endpoint',
                (sourceName) => {
                    const sourceConfig = DataFetcher.getSourceConfig({
                        sourcesConfig,
                        sourcePath: sourcePathOf(sourceName),
                        isEmbed: true,
                    });

                    expect(sourceConfig?.dataEndpoint).toBeTruthy();
                    // The URI the fetcher builds out of it has to parse — the ERR_INVALID_URL guard.
                    expect(
                        () => new URL(`${sourceConfig?.dataEndpoint}/entry-id/result`),
                    ).not.toThrow();
                },
            );

            test.each(embedDetourSources)(
                'an embed run on %s resolves to the same source as an authorized run',
                (sourceName) => {
                    const args = {sourcesConfig, sourcePath: sourcePathOf(sourceName)};

                    const embedConfig = DataFetcher.getSourceConfig({...args, isEmbed: true});
                    const authorizedConfig = DataFetcher.getSourceConfig({...args, isEmbed: false});

                    expect(embedConfig?.dataEndpoint).toBe(authorizedConfig?.dataEndpoint);
                    expect(embedConfig?.sourceType).toBe(sourceName);
                    expect(authorizedConfig?.sourceType).toBe(sourceName);
                },
            );

            // A public link carries no embed token, so it never takes the detour.
            test.each(embedDetourSources)('a non-embed run on %s is untouched', (sourceName) => {
                const sourceConfig = DataFetcher.getSourceConfig({
                    sourcesConfig,
                    sourcePath: sourcePathOf(sourceName),
                });

                expect(sourceConfig?.sourceType).toBe(sourceName);
                expect(sourceConfig?.dataEndpoint).toBeTruthy();
            });
        },
    );

    describe('installation declaring dedicated embed endpoints', () => {
        const buildSourcesConfig = (
            embedSources: Record<string, SourceConfig>,
        ): Record<string, SourceConfig> => ({
            bi_datasets: {dataEndpoint: 'https://back.example.com/api/data/v2/datasets'},
            bi_connections: {dataEndpoint: 'https://back.example.com/api/data/v1/connections'},
            ...embedSources,
        });

        test('an embed run uses the embed endpoint, reported as the plain source', () => {
            const sourcesConfig = buildSourcesConfig({
                bi_datasets_embed: {
                    dataEndpoint: 'https://back.example.com/embeds/api/data/v2/datasets',
                },
            });

            const sourceConfig = DataFetcher.getSourceConfig({
                sourcesConfig,
                sourcePath: sourcePathOf('bi_datasets'),
                isEmbed: true,
            });

            expect(sourceConfig?.dataEndpoint).toBe(
                'https://back.example.com/embeds/api/data/v2/datasets',
            );
            // The requested path is /_bi_datasets/… — the plain source type is what crops it.
            expect(sourceConfig?.sourceType).toBe('bi_datasets');
        });

        test('an embed source declared without an endpoint falls back to the plain source', () => {
            const sourcesConfig = buildSourcesConfig({
                bi_datasets_embed: {dataEndpoint: undefined},
            });

            const sourceConfig = DataFetcher.getSourceConfig({
                sourcesConfig,
                sourcePath: sourcePathOf('bi_datasets'),
                isEmbed: true,
            });

            expect(sourceConfig?.dataEndpoint).toBe(
                'https://back.example.com/api/data/v2/datasets',
            );
            expect(sourceConfig?.sourceType).toBe('bi_datasets');
        });

        test('an unknown source stays unresolved on an embed run', () => {
            expect(
                DataFetcher.getSourceConfig({
                    sourcesConfig: buildSourcesConfig({}),
                    sourcePath: '/_unknown_source/whatever',
                    isEmbed: true,
                }),
            ).toBeNull();
        });
    });
});
