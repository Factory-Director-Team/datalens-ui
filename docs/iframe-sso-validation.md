# Iframe SSO implementation validation — 2026-10-21

Status: **implemented, Docker acceptance pending**. Do not treat this report as a production acceptance result. The real host application's code is outside this workspace; its ticket and verification endpoints still need to implement the contract in [iframe-sso.md](./iframe-sso.md).

The agreed test boundary is public BFF HTTP/browser behaviour, using real DataLens auth, United Storage and Redis in Docker with a test host backend. The happy-path browser test was written before implementation, but the environment prevented executing the red/green cycle. No in-process auth/store mocks substitute for that acceptance run.

## Checks completed

| Check                                                      | Result                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| UI server, UI client and tests TypeScript checks           | Passed                                                                                                      |
| MCP TypeScript check                                       | Passed                                                                                                      |
| ESLint on changed TypeScript files                         | Passed, no errors                                                                                           |
| Compose validation: test stand and deployment overlay      | Passed                                                                                                      |
| Test host/bridge JavaScript syntax and runner shell syntax | Passed                                                                                                      |
| Playwright discovery                                       | 57 handoff browser cases; 3 registry cases repeated across 5 infrastructure phases                          |
| UI full Jest suite (`--runInBand --watchman=false`)        | 115 suites passed, 2 failed; 912 tests passed, 5 failed                                                     |
| Original UI commit comparison                              | The same 5 failures reproduced at `d1da367b3cbd518cfea654166b419ee4029c3820` in an isolated source snapshot |
| MCP full Vitest suite                                      | 44 files passed, 1 failed; 307 tests passed, 14 failed                                                      |
| Whitespace checks                                          | Passed                                                                                                      |

The five baseline UI failures are `Paginator.test.tsx` (3) and `valueFormatter.test.tsx` (2): tests query `data-testid`, while the rendered controls expose `data-qa`. They were not changed as part of SSO. The initial Jest attempt also encountered a forbidden Watchman state-directory operation; disabling that optional watcher allowed the suite to execute.

All 14 MCP failures are in `http-app.test.ts`, at HTTP server startup. A minimal independent Node listener confirms `EPERM: operation not permitted 127.0.0.1` in this sandbox. Other MCP suites passed. The installed pnpm wrapper also attempted an unavailable version switch, so checks used the repository's installed executables directly.

## Docker acceptance

Attempted: `bash tests/sso/run.sh --project=chromium handoff.test.ts`.

Result: Docker API access denied at `unix:///Users/viktor/.docker/run/docker.sock`. Containers and browser tests **did not run**. Compose validation and test discovery do not establish runtime correctness. Rerun `bash tests/sso/run.sh` from an environment that can access Docker.

The stand includes real auth 0.34.0, two locally built BFF replicas, local US, durable Redis, a test host backend and HTTPS sibling origins. Coverage includes independent sessions, explicit reopen after logout, revocation, host outage, native login/logout/refresh, ticket replay/browser/Origin binding, full iframe editing, machine BFF writes, anonymous Public link/Embed and infrastructure restart/outage/loss. Failed binding persistence is induced using a real Redis memory limit after ticket consumption. Runtime behaviour of all these new cases remains unverified.

The failed-registration case asserts no browser auth cookies and denied access. It does not independently observe the auth service's deletion of the newly created session; the best-effort cleanup call is covered by static review only. Actual expired-token timing, real host integration and actual Safari also remain acceptance work; the HTML refresh test forces the expiry hint, and Docker WebKit does not substitute for Safari.

## Standards

No remaining findings. Static review corrected the stand's missing auth endpoint and US embedding encryption key. Anonymous Public/Embed layouts keep their original iframe presentation.

## Spec

One remaining acceptance coverage gap: independent observation of auth-session cleanup after failed binding persistence. No additional concrete authentication bypass was identified by static review. Successful acceptance remains contingent on the Docker run and the real host contract.

Findings: Standards 0; Spec 1 (cleanup acceptance coverage). Neither axis establishes runtime correctness without the outstanding Docker execution.
