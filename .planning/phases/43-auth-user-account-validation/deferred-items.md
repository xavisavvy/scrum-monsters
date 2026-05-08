# Deferred items — Phase 43

Out-of-scope issues discovered during Plan 43-02 execution. NOT caused by this
plan; not fixed here per the executor scope-boundary rule.

## Pre-existing lint errors (12 total)

`npm run lint` reports 12 errors and ~402 warnings; ALL errors live in files
unrelated to Plan 43-02:

- `client/src/components/game/ProjectileSystem.tsx` — empty block (no-empty)
- `client/src/components/utils/CharacterTools.tsx` — empty block (no-empty)
- `client/src/hooks/useImageDimensions.ts` — empty block (no-empty)
- `client/src/hooks/useOrientation.ts` — `MediaQueryListEvent` no-undef
- `client/src/lib/stores/useWebSocket.reconnect.test.ts` — `queueMicrotask` no-undef
- `client/src/lib/utils/sessionStorage.test.ts` — `btoa`/`atob` no-undef
- `client/src/lib/utils/sessionStorage.ts` — `btoa` no-undef
- `server/vite.ts` — empty block (no-empty)
- `tests/profiling/run-profile.ts` — empty block (no-empty)

`npx eslint` against ONLY the files this plan touches
(`server/auth/__testHelpers/mockOidc.ts`, `server/auth/routes.test.ts`,
`server/config/env.ts`) reports 0 errors and 1 warning (the documented
`(req as any).oidc` cast convention shared with `server/auth/routes.ts:8-9`).

These pre-existing errors should be tracked separately — likely under a future
"lint hygiene" plan.
