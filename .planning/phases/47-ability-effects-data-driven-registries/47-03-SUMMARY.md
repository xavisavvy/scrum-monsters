---
phase: 47-ability-effects-data-driven-registries
plan: "03"
subsystem: shared-registry
tags: [registry, avatar-classes, combat, icon, typescript, tdd]
dependency_graph:
  requires: ["47-01"]
  provides: ["AVATAR_CLASSES-ClassDef", "HEALER_CLASSES-derived", "getClassBaseDamage-registry", "AVATAR_IMAGES-typed", "getClassIcon-collapsed"]
  affects: ["server/domains/CombatManager.ts", "client/src/components/game/*", "shared/gameEvents.ts"]
tech_stack:
  added: []
  patterns: ["Record<K,V> registry with compile-checked completeness", "derived constants from registry filter", "registry-backed icon lookup"]
key_files:
  created:
    - shared/gameEvents.test.ts
  modified:
    - shared/gameEvents.ts
    - server/domains/CombatManager.ts
    - server/domains/CombatManager.test.ts
    - client/src/lib/avatarImages.ts
    - client/src/components/game/SpriteRenderer.tsx
    - client/src/components/game/Lobby.tsx
    - client/src/components/game/CharacterDetailsPanel.tsx
decisions:
  - "[47-03] ClassDef interface added to shared/gameEvents.ts with role/baseDamage/icon; AVATAR_CLASSES annotated Record<AvatarClass, ClassDef> — missing class is a tsc error"
  - "[47-03] paladin role='healer' with baseDamage=15 — role and baseDamage are independent fields per plan spec"
  - "[47-03] oathbreaker icon='💀' sourced from CharacterDetailsPanel (the only complete 10-entry map); SpriteRenderer/Lobby had wrong '⚡' — fixed by construction"
  - "[47-03] HEALER_CLASSES derived via Object.entries(AVATAR_CLASSES).filter(role==='healer') — drift impossible"
  - "[47-03] getClassBaseDamage fallback stays 20 (standard DPS) matching the old switch default"
metrics:
  duration: "~7 minutes"
  completed: "2026-06-22"
  tasks: 3
  files: 7
---

# Phase 47 Plan 03: Promote AVATAR_CLASSES to Typed Registry Summary

One-liner: AVATAR_CLASSES promoted to `Record<AvatarClass, ClassDef>` with role/baseDamage/icon, collapsing three duplicate icon maps and a server switch into a single compile-checked registry.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Promote AVATAR_CLASSES to Record<AvatarClass, ClassDef> + test | 9c55ab3 | shared/gameEvents.ts, shared/gameEvents.test.ts |
| 2 | Derive HEALER_CLASSES and getClassBaseDamage from registry | e6dca00 | server/domains/CombatManager.ts, server/domains/CombatManager.test.ts |
| 3 | Retype AVATAR_IMAGES + collapse three getClassIcon maps | 5a14d0d | avatarImages.ts, SpriteRenderer.tsx, Lobby.tsx, CharacterDetailsPanel.tsx |

## What Was Built

### ClassDef type (shared/gameEvents.ts)

`ClassRole = 'tank' | 'healer' | 'dps'` and `ClassDef` interface exported. AVATAR_CLASSES is annotated as `Record<AvatarClass, ClassDef>` — omitting any of the 10 classes is a tsc error. Each entry carries:
- `role`: healer (cleric, paladin, bard), tank (warrior, oathbreaker), dps (rest)
- `baseDamage`: matches the old CombatManager switch exactly (warrior/paladin/oathbreaker=15, ranger/rogue/monk=20, sorcerer/wizard=25, cleric/bard=12)
- `icon`: emoji sourced from CharacterDetailsPanel (the only previously-complete map), including monk '🥋'

### Registry derivations (server/domains/CombatManager.ts)

- `HEALER_CLASSES` derived via `Object.entries(AVATAR_CLASSES).filter(role === 'healer').map(cls)` — no more literal array to maintain
- `getClassBaseDamage` reduced from 30-line switch to: `AVATAR_CLASSES[avatarClass]?.baseDamage ?? 20`

### Client cleanup

- `AVATAR_IMAGES` retyped `Record<AvatarClass, string>` — all 10 class keys already present, strict type confirmed
- `SpriteRenderer.tsx`, `Lobby.tsx`, `CharacterDetailsPanel.tsx` each replaced their inline 9/10-entry icon map with `AVATAR_CLASSES[cls].icon ?? '⚔️'`
- Monk icon '🥋' now resolves in all three components by construction
- Oathbreaker icon corrected from wrong '⚡' (SpriteRenderer/Lobby) to canonical '💀' (from CharacterDetailsPanel)

## Verification

- `npx vitest run shared/gameEvents.test.ts` — 9 tests pass
- `npx vitest run server/domains/CombatManager.test.ts` — 128 tests pass (20 new: 10-class parity + HEALER_CLASSES membership)
- `npm run check` — exits 0
- `npm run lint` — exits 0
- Full suite: 890 tests pass across 56 files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected oathbreaker icon in SpriteRenderer and Lobby**
- Found during: Task 3
- Issue: SpriteRenderer.tsx and Lobby.tsx had `oathbreaker: '⚡'` — CharacterDetailsPanel.tsx (the authoritative source with all 10 entries) had `oathbreaker: '💀'`. The new registry consolidates on `'💀'`.
- Fix: AVATAR_CLASSES.oathbreaker.icon = '💀' sourced from CharacterDetailsPanel per plan spec; all three components now use the registry, so oathbreaker gets the canonical icon everywhere.
- Files modified: shared/gameEvents.ts (source), SpriteRenderer.tsx/Lobby.tsx (delegated)
- Commit: 9c55ab3 (registry definition), 5a14d0d (client delegation)

### TDD Gate Compliance

- RED commit: 9c55ab3 (includes test + implementation — both staged together; tests were written first and confirmed failing before implementation edits were applied, but were committed atomically)
- GREEN: tests pass post-implementation in same commit
- REFACTOR: none needed

## Known Stubs

None — all registry entries are complete with real data.

## Threat Flags

None — AVATAR_CLASSES is static trusted data (T-47-07 accepted in plan threat model).

## Self-Check: PASSED

- shared/gameEvents.test.ts: exists, 9 tests pass
- shared/gameEvents.ts: ClassDef and AVATAR_CLASSES exported with Record<AvatarClass, ClassDef> annotation
- server/domains/CombatManager.ts: HEALER_CLASSES derived from registry, getClassBaseDamage uses registry lookup
- server/domains/CombatManager.test.ts: 10-class parity tests + HEALER_CLASSES membership tests added
- client/src/lib/avatarImages.ts: Record<AvatarClass, string>
- Commits: 9c55ab3, e6dca00, 5a14d0d all present in git log
