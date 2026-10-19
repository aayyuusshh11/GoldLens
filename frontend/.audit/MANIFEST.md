# Quarantine manifest — files moved into `.audit/mine/` on 2026-10-19

REASON: two AI implementations collided in the same working tree. The tree now
mounts the parallel implementation (`src/main.tsx` → `src/app/App.tsx`, fixture/live
config gate, dark theme, `src/features/**`). The files below are the survivors of
the FIRST implementation (React 19/RR7/Tailwind4, light editorial, typed client +
tests). They are dead code in the current runtime but break `tsc` (composite
typecheck) because they sit inside `src/`.

NOTHING IS DELETED. Every path below moved 1:1 (recursively) from
`frontend/<path>` → `frontend/.audit/mine/<path>`. To restore: copy back
(restore_ notes at the bottom).

Origin: written by the implementation session (Phases 1–4) whose verifications
were: `tsc -b && vite build` clean; vitest 24/24 pass; production preview
HTTP 200 smoke test. Verified gem: overview/report honesty components.

## Moved files

- src/App.tsx
- src/index.css
- src/state/ReportContext.tsx
- src/hooks/useBackendProbe.ts
- src/lib/api/client.test.ts
- src/lib/api/endpoints.ts
- src/lib/api/json.ts
- src/lib/api/sample.ts
- src/lib/api/sample.test.ts
- src/lib/api/types.ts
- src/lib/api/sample/api_contract_sample.json
- src/lib/format.ts
- src/lib/format.test.ts
- src/lib/report/analysis.ts
- src/lib/report/analysis.test.ts
- src/components/report/ValidityBanner.tsx
- src/components/report/SampleNotice.tsx
- src/components/report/overviewRows.ts
- src/components/primitives/DetailRows.tsx
- src/components/primitives/ErrorPanel.tsx
- src/components/primitives/LoadingSkeleton.tsx
- src/components/primitives/ReasonList.tsx
- src/pages/OverviewPage.tsx
- src/pages/PairExplorerPage.tsx
- src/pages/SignalForensicsPage.tsx
- src/pages/BacktestPage.tsx
- src/pages/DataQualityPage.tsx
- src/pages/NotFoundPage.tsx

## Contra not moved (rewritten by the other stream, shared paths)

- src/lib/api/{client,config,errors}.ts
- src/components/layout/{Badges,PageHeader,AppShell}.tsx
- src/components/primitives/{SectionPanel,EmptyState}.tsx?  (SectionPanel edits: theirs)
- src/main.tsx / vite.config.ts / tsconfig*/  / package.json
- docs/ (three of our files rewritten by the other stream)

## Restore (if the user picks MY implementation as base)

```powershell
Copy-Item -Recurse -Force .audit\mine\src . # then restore configs from the lockfile snapshot era
npm ci # with .audit/package-lock.mine.json restored as package-lock.json
```

- UPDATE: restored ReasonList.tsx to src (their 5 components import it); quarantined src/lib/utils.ts additionally.

- UPDATE 2: additionally quarantined vitest.config.ts � it shadowed their vite.config test settings (globals+setupFiles) and broke all component tests via missing RTL auto-cleanup/jest-dom.

- UPDATE 3: added include: ['src/**/*.test.{ts,tsx}'] to their vite.config test block so vitest ignores the .audit/ quarantine.

- UPDATE 4 (gap pass): quarantined files unchanged; adopted-base fixes live in src (see docs/INTEGRATION_BLOCKERS.md section 5).
