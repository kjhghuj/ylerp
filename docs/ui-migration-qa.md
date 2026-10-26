# UI migration verification

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
  tests, UI-foundation lint, production build, cross-browser critical flows and Chromium
  module/theme/viewport matrix. Browser artifacts are retained for 14 days.
- Production deployment depends on this reusable quality workflow. Pure frontend/docs
  pushes select `web`; backend/shared/deployment changes select `full`. Missing history
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
