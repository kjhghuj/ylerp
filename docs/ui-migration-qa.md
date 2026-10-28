# UI migration verification

## 当前最终验收（2026-10-28）

前端全量测试 **94 个文件、1235 通过、1 条原有跳过、0 失败**；浏览器 **32 条用例通过并生成 110 张全模块截图**。TypeScript、生产构建通过，lint 为 **0 errors**。同机串行性能对比通过全部三项 10% 回退门禁。详见下文[最终浏览器验收](#final-browser-acceptance)与[最终全量回归和性能证据](#final-full-regression-and-performance-acceptance)。

尚未生产部署。真实 Docker 隔离部署与回滚演练仍待可用环境；本地命令模拟已验证 web 发布与回滚流程。下文 Stage 0 和 intermediate 部分保留历史记录，最终状态以上述结果及最后的详细证据为准。

## Stage 0 — baseline and release protection (2026-10-26)

The original production build was copied before migration to `.tmp/ui-baseline/dist`.
It remains independent of later `frontend/dist` builds. All fixture data is synthetic.
Playwright fixture tests are restricted to loopback URLs; API routes explicitly enumerate
the expected endpoints and return a failing response for every unexpected request or write.
No production account, business mutation, paid AI call or deployment was used.

Original code baseline previously verified by the orchestrator:

- TypeScript `tsc --noEmit`: passed.
- Frontend Vitest: 79 files, 1164 tests passed, 1 skipped.
- Vite production build: passed; existing large-chunk warning retained separately.
- Existing React `act` and jsdom chart-size warnings are baseline warnings.

Browser baseline captured against the copied original build:

- Chromium: all 11 authenticated modules at 1920×1080, 1440×1024,
  1366×768, 768×1024 and 390×844, each in light and dark mode.
  All 10 module-matrix test cases passed their explicit fixture/runtime assertions.
- Each matrix captures 11 page images, including personal center. The matrix uses
  populated synthetic Dashboard/ProductList/Finance/Schedule/Usage/User data;
  analysis has an intentional no-shop state, restock an uncomputed state and image tools
  an empty gallery. These do not prove populated analysis or computed restock usability.
- Artifacts: `.tmp/ui-baseline/results/ui-migration-all-modules-<width>-<theme>-chromium/`.
- Successful login in both themes and rejected credentials were observed passing.
- A separate profile smoke and the performance trial intermittently failed because
  the original Tailwind CDN script failed to load (`tailwind is not defined`).
  This is evidence of the original external runtime dependency, not a migration result.
- `UI_BASELINE=1` records original document overflow instead of approving it;
  candidate runs must omit that flag and fail on document overflow.
- Final candidate screenshots, full cross-browser results, populated analysis/restock
  acceptance and the serial performance comparison are **pending** later migration stages.

The browser installer completed Chromium, Firefox and WebKit. During a concurrent
`npm ci` the preview process was stopped to release Windows' esbuild executable lock;
the copied build and screenshot evidence remain intact.

## Reproducible commands

From `frontend`, after `npm ci --legacy-peer-deps`:

```powershell
npm run typecheck
npm test
node --test scripts/web-smoke.test.mjs
npm run build
npx playwright install chromium firefox webkit
npx playwright test --grep '@cross-browser'
$env:UI_CAPTURE='1'
npx playwright test --project=chromium --grep 'all modules'
```

For the original static copy, start a preview on port 4174 with
`node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174 --strictPort --outDir ../.tmp/ui-baseline/dist`,
then set `UI_BASE_URL=http://127.0.0.1:4174`, `UI_BASELINE=1`,
`UI_ARTIFACT_DIR=../.tmp/ui-baseline/results` and `UI_CAPTURE=1` before running the matrix.
Unset `UI_BASELINE` and `UI_BASE_URL` before verifying the candidate.

Performance must run serially on the same machine with three fresh browser contexts:

```powershell
npx playwright test --project=chromium --grep '@performance' --workers=1
node scripts/compare-ui-performance.mjs <baseline-performance.json> <candidate-performance.json>
```

The three-run median covers first usable Dashboard, product search and sync dialog
opening. Resource records include the original CDN request, its duration and available
transfer sizes. Cross-origin `transferSize=0` without Timing-Allow-Origin is not zero
network cost. Do not approve the 10% budget using the concurrent module-matrix timings.

## Release protection

- PR quality workflow: locked install, typecheck, frontend tests, smoke-script contract
  tests, lint of all changed UI TypeScript sources, including formerly ignored image-tool modules, production build, cross-browser critical flows and Chromium
  module/theme/viewport matrix. Browser artifacts are retained for 14 days.
- Production deployment depends on this reusable quality workflow. Pure frontend/docs
  pushes select `web`; backend/shared/non-web Compose changes select `full`; CI and release-script-only changes remain `web`. Missing history
  conservatively selects `full`. Manual workflow dispatch explicitly selects either.
- The exact validated SHA is checked out on the server after verifying it belongs to
  main. The server builds serially, respecting the existing memory constraint.
- `web` only rebuilds/replaces web. It never rebuilds or restarts API, runs Prisma, or
  mutates business data. `full` retains API build and database-migration behavior.
- New web images use `ylerp-web:<SHA>`. Before replacement, the current image is tagged
  `ylerp-web:rollback-<SHA>`. An error after promotion restores that prior web image.
- Read-only deployment smoke checks React HTML, **all** built JS/CSS including lazy
  chunks, content types, nonempty bodies, API health and an unauthenticated `/api/auth/me`
  returning 401 through Nginx. It does not log in or submit business operations.
- Automatic rollback applies to web only. A failed `full` deployment does not undo an
  API or database migration. A first deployment without an older image needs operator
  intervention. Neither case is described as automatic full-system rollback.

Local verification of release tooling: `bash -n scripts/deploy-production.sh`,
`node --check frontend/scripts/web-smoke.mjs`, and 5 smoke contract tests passed
(normal assets, missing lazy chunk, SPA fallback, missing app root, broken API proxy).
The deploy script has not been executed against production and its Docker rollback
path still requires an isolated deployment rehearsal.

## Stage 0 review and pilot checkpoint

The independent reviewer approved the stage 0 changes. The orchestrator also reran
the five smoke contract tests and a Bash command-stub simulation of both successful
web deployment and smoke-failure rollback. Both simulation paths passed. These
checks prove the script's command/control flow; they do **not** exercise real Docker,
Compose container networking, a production image or a real database migration.
An isolated real-Docker deployment/rollback rehearsal remains required.

After the component foundation and product-list pilot, the orchestrator independently
verified a candidate production build, four Chromium smoke cases, and the full module
matrix at 1440×1024 in light and dark mode. Those checks passed. Intermediate screenshots
are under `.tmp/ui-pilot-qa`; these are pilot evidence, not the final all-module migration
acceptance. The final five-viewport matrix, Firefox/WebKit flows, populated analysis and
computed restock cases, and serial baseline/candidate performance comparison remain pending.


## Intermediate verification checkpoint (superseded below)

- Full frontend regression: **94 test files, 1228 passed, 1 existing skipped, 0 failed**.
  Machine-readable result: `.tmp/ui-final-vitest.json`; log: `.tmp/ui-final-vitest.log`.
  Later PA-only changes have an additional 203-test targeted run; final browser/build records follow below.
- Changed-source lint: **0 errors, 86 warnings**, `.tmp/final-lint.log`.
  CI uses `scripts/lint-ui-changes.mjs` with the PR/push base and `--no-ignore`.
  Warnings remain visible; the gate does not suppress existing warnings or weaken business assertions.
- Release scope classification is now executable and tested in `scripts/deployment-scope.mjs`.
  Four contracts cover this whole UI migration (including CI/release scripts and only-web
  Compose edits), backend/shared/non-web Compose changes, validated manual overrides,
  unknown inputs and missing history. Unknown layouts/failed history conservatively select full.
- `frontend/scripts/check-ui-classes.mjs` rejects invalid repeated Tailwind alpha modifiers.
- All new browser checks use loopback and explicit synthetic fixtures. They cover populated
  51-product analysis pagination, details and nested credentials; computed restock with
  selection, unchanged compute request intent and disabled stale save/export/copy; role
  navigation; and actual mobile coarse-pointer 44px primary controls. Upload/download
  regression is included across Chromium/Firefox/WebKit. Check final results before approval.
- Foundation semantic token pairs were independently measured >=4.5:1 in both themes.
  This is token-level evidence, not a claim that every rendered page passed a full automated
  accessibility audit. Browser console collection includes severe React ref/hook/DOM and
  Dialog title/description errors in addition to uncaught page errors.
- Real Docker rollback rehearsal is unavailable on this workstation: the
  `dockerDesktopLinuxEngine` pipe is absent. Prior Bash-stub success/failure rollback
  simulations remain the available command/control-flow evidence. No production deployment,
  API restart, schema migration or real business write was performed.


### Final browser acceptance

The final candidate build passed **32/32 Playwright cases** on 2026-10-28:
22 Chromium cases (10 full module/theme/viewport matrices plus critical and populated flows),
5 Firefox and 5 WebKit critical flows. The latter include real local PNG upload, ordinary
pointer removal and JSON download with parsed content validation. No forced clicks or live
business/AI writes are used. Coarse-pointer verification uses `isMobile` + `hasTouch`, confirms
`(pointer: coarse)`, tests 44px login/navigation controls, taps outside compact Switch artwork
within its expanded hit area, and taps a second shop's 44px Checkbox label without changing
its adjacent selected shop. Log: `.tmp/ui-final-verified-browser.log`.

The matrix checks all 11 authenticated views at 1920×1080, 1440×1024, 1366×768,
768×1024 and 390×844, each in both themes, without document-level horizontal overflow.
It retains the original fixture data and capture state for comparable screenshots.
Additional populated analysis screenshots cover page 1/2 of 51 products and a detail dialog;
computed restock screenshots cover a selected executable SKU before the condition-change lock.
Runtime errors and enumerated severe React/accessibility console messages are absent.
This is a defined regression suite, not an exhaustive accessibility or production-load audit.

- Before: `.tmp/ui-baseline/results/ui-migration-all-modules-<width>-<theme>-chromium/`.
- After: `.tmp/ui-final-verified/ui-migration-all-modules-<width>-<theme>-chromium/`.
- Open `.tmp/ui-screenshot-comparison.html` for links pairing each of the 110 matching images.
- Populated analysis/restock: `.tmp/ui-final-verified/acceptance-*/`.
- The orchestrator visually checked desktop/mobile Chroma, Finance, computed restock and
  populated analysis. This caught and led to fixes for font-option clipping, help/remove
  button overlap and low contrast over tinted sales bars. Final affected screenshots were
  recaptured and reviewed.

Latest production build passed in 16.23s. Existing >500KB chunk warning remains.
All local JS/CSS chunks together: baseline 3,107,832 raw / 937,581 gzip bytes;
candidate 3,381,942 raw / 1,016,271 gzip bytes (+8.39% gzip).
These totals include lazy chunks and **exclude the old runtime CDN**, so they are neither a
first-screen transfer comparison nor evidence of the interaction timing budget.
Raw records: `.tmp/ui-build-sizes.json`.


### Final full regression and performance acceptance

After the last UI fixes and the test-only CSS-source reader correction:
**94 frontend test files, 1235 passed, 1 original skipped, 0 failed**.
The contrast test reads real source CSS through Node fs because Vitest's disabled CSS
transform can return an empty `?raw` import when that stylesheet was imported earlier in
another suite. Its 336 contrast combinations and actual source alpha/token checks remain.
Final evidence: `.tmp/ui-final-complete-verified-vitest.json` and matching `.log`.
Typecheck passed (`.tmp/ui-final-typecheck.log`); changed-source lint passed with
0 errors / 86 warnings (`.tmp/ui-final-complete-lint.log`). Nine release/smoke contracts
and the invalid-class guard passed. The existing single skipped test was not expanded.

Performance was measured serially, baseline then candidate, on this workstation with
three fresh Chromium contexts per build, identical synthetic data, viewport 1440×1024,
locale/timezone and reduced motion. The baseline was the original untouched copied build,
including its live Tailwind CDN script. Both complete three-context trials passed.

| Three-context median | Original | Final | Change |
|---|---:|---:|---:|
| First usable Dashboard | 4464.7ms | 255.3ms | -94.3% |
| Product search | 30.2ms | 24.5ms | -18.8% |
| Sync dialog opening | 135.1ms | 64.1ms | -52.5% |

`compare-ui-performance.mjs` passed the 10% regression gate for all three metrics.
This measures the defined synthetic/local workflow on one device, not production latency
or a general claim of equivalent speedup on every network.

The first measurement round also passed (4829.6→248.1ms first render,
35.1→25.7ms search, 163.0→63.5ms dialog), but browser ResourceTiming entries were empty
because the business fixture clock masks that API. We retained that round and corrected
only the harness by recording native Playwright request timings/sizes after the timed
operations. The corrected round above was then run once on each build; no faster samples
were selected or overwritten. Both rounds remain inspectable:

- Initial: `.tmp/ui-final-performance-baseline/` and `.tmp/ui-final-performance-candidate/`.
- Corrected: `.tmp/ui-final-performance-baseline-network/` and `.tmp/ui-final-performance-candidate-network/`.
- Gate output: `.tmp/ui-final-performance-network-comparison.log`.

Each corrected baseline context observed the actual CDN redirect and a successful
`https://cdn.tailwindcss.com/3.4.17` response. The script response bodies were
126857/126860/126869 bytes. Redirect request durations were approximately
2395.5/5278.5/3818.0ms; the following script requests took 264.0/296.6/271.8ms.
The candidate made no Tailwind CDN request. These timings include the network conditions
of this trial. Zero/unavailable browser cross-origin transfer entries were not treated as
zero network cost.

All local implementation and defined automated/visual acceptance gates passed. The
remaining external release qualification is the real-Docker isolated rollback rehearsal;
the daemon is unavailable here. Production deployment and real API smoke on an isolated
test environment were not performed by this UI migration task.
