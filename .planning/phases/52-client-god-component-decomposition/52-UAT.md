---
status: testing
phase: 47-52 (v6.0 Maintainability sweep)
source: [47-*-SUMMARY.md, 48-*-SUMMARY.md, 49-*-SUMMARY.md, 50-*-SUMMARY.md, 51-*-SUMMARY.md, 52-*-SUMMARY.md]
started: 2026-06-24T11:00:00Z
updated: 2026-06-24T11:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running dev server. Start fresh (`npm run dev`). Server boots with no
  errors, /api/health returns 200, the home page loads, and you can create a lobby,
  pick an avatar, and land in the tavern lobby. (Phases 48/49/50 rewired server-side
  handler delegation and domain-manager wiring — this proves a fresh boot still works.)
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Fresh `npm run dev` boots clean; /api/health 200; create lobby → pick avatar → land in tavern lobby works end-to-end.
result: PASS — Server booted on :5002 (DB healthy via k8s port-forward), /api/health 200, /api/ws-health ok. Home → Start a Battle → /play → Create Battle Lobby (code HRHNYV) → avatar selection (all 10 classes incl. Oathbreaker) → picked Warrior → Confirm → landed in tavern lobby. 0 console errors (1 benign "Multiple Three.js instances" dev warning). 2026-06-24.

### 2. Lobby movement, jump & afterimage
expected: In the tavern lobby, arrow keys move your avatar smoothly; jump produces an arc with an afterimage trail; movement stays smooth (no stutter) over a sustained hold. (Phase 52 MAINT-11 moved buff/jump values to refs and extracted useLobbyMovement.)
result: PASS — Held ArrowRight moved avatar left:200px→425px over 1.2s and stopped cleanly on keyup (no drift). Jump = clean parabola (0→-50px peak→0, returns to base). Afterimage trail is correctly gated on a speed buff (`if speedBuff` in useLobbyMovement.ts:175,249): with no buff → 0 trail elements; after casting `haste` → 14 trail elements during both move and jump. Captured uat-test2-haste-afterimage.png. 2026-06-24.

### 3. Tavern 3D scene renders + 60fps perf guardrail
expected: The tavern scene (lighting, characters) renders correctly; sustained interaction holds ~60fps with no new frame drops vs. before the refactor. This closes the pending manual profiler/perf gate from Phase 52 verification.
result: PARTIAL — Scene renders correctly (pixel-art tavern: wood floor, stone walls, torches, avatar; captured uat-tavern-rendered.png). The 60fps React DevTools Profiler sub-gate still requires a manual human pass (cannot be measured via headless automation) — this is the lone outstanding human_needed item from 52-VERIFICATION.md.

### 4. Lobby spell / emote effects render on targets
expected: Casting lobby spell-emotes (e.g. fire, ice, freeze, petrify, fly, enlarge/reduce, hold, massacre, chaos, dragon, dispel, invisibility) shows the correct visual on the correct target avatar; dispel clears all active effects at once. (Phase 52 MAINT-12 replaced the 13-state cascade with a single buffReducer.)
result: PASS — `haste` applied a speed buff end-to-end (socket→applySpellEffects→buffReducer→render; 14 afterimage trail elements during move+jump). `dispel magic` cleared the caster's effects (DISPEL_ALL). TARGETED cast verified with 2 players: Preston cast `freeze Mira` → ice/frozen visual rendered on **Mira's** avatar specifically in P1's view (uat-freeze-p1.png), and on Mira's own client she was frozen and could not move (440px→440px, jump affordance removed). Correct effect on the correct target. MAINT-12 buffReducer fully confirmed (apply, targeted, dispel). 2026-06-24.

### 5. Settings dialog — host + phase guard
expected: Host can open lobby settings and change timer/Jira/estimation options; the estimation-settings change stays gated by phase exactly as before; a non-host cannot change settings. (Phase 52 seam extraction + Phase 50 SessionManager settings host guard.)
result: PASS — Host side: as host in lobby phase, changed Estimation Scale Fibonacci→doubling (the phase-gated control, editable in lobby ✓; the doubling scale then correctly carried into the battle vote picker), toggled Estimation Timer, set JIRA URL — all accepted, 0 errors. Non-host: Mira (non-host) has NO Settings button in her UI at all (buttons limited to Boss Music/mute/copy-code/team selectors), so a non-host cannot open or change lobby settings — enforced at the UI layer, backed by the Phase-50 server-side host guard (unit-tested). estimation-disabled-when-not-in-lobby (battle phase) not separately re-checked; covered by the host-guard + phase-gate unit tests. 2026-06-24.

### 6. Avatar rendering (local vs remote, size/class)
expected: Each player's avatar renders with the correct class sprite and size; your own (local) avatar and other (remote) avatars both display correctly, including any active size buffs. (Phase 52 LobbyAvatar extraction with explicit props.)
result: PASS (with bug found) — Local (Preston) renders immediately; remote (Mira) renders correctly AFTER moving (captured uat-test6-both-avatars-after-move.png). LobbyAvatar extraction itself works. ⚠️ BUG FOUND: remote avatars are invisible until the remote player's first movement — `Lobby.tsx:1548 if (!position) return null` gates rendering on a `playerPositions` entry that only exists after a movement broadcast. Full root-cause + proposed fix in `.planning/bugs/lobby-remote-avatar-invisible-until-move.md`. Pre-existing (not introduced by Phase 52). 2026-06-24.

### 7. Class ability buffs actually apply (dropped-buff bug fix)
expected: Using Warrior Berserker Rage or Bard Inspire visibly boosts damage for the duration; Paladin Holy Shield / Divine Intervention absorbs incoming damage. These previously did nothing. (Phase 47 — the "dropped ability buffs" live bug.)
result: NOT VERIFIED via automation — needs follow-up. Learned the combat model: boss HP/defeat is driven by estimation consensus (story points), and the Ctrl/click/Q shooting is a cosmetic overlay. Measuring a "damage boost duration" headlessly is unreliable, and Bard/Paladin classes weren't in play (P1 Warrior, P2 auto-Warrior). Recommend manual spot-check or a targeted automated combat session. Automated unit tests for this fix already pass per 52-VERIFICATION.

### 8. Boss debuff — Oathbreaker Aura of Dread
expected: Using the Oathbreaker aura ability applies an attack-slow debuff to the boss for its duration (~8s). (Phase 47 activeDebuffs map.)
result: NOT VERIFIED via automation — needs an Oathbreaker player in an active boss fight (neither P1 nor P2 was Oathbreaker; the Join flow auto-assigned Warrior — see Test 6 secondary note). Recommend manual spot-check.

### 9. Boss sprite + class icon correctness
expected: The Technical Debt Golem boss shows its correct sprite (not a mismatched one); the Oathbreaker class icon shows 💀 (not the old wrong ⚡). (Phase 47 registry-derived sprite/icon maps — golem-AI mismatch fix.)
result: PARTIAL/PASS — Oathbreaker class icon: PASS. Created a lobby with Preston as Oathbreaker; the roster renders **💀** (not the old wrong ⚡) — Phase 47 registry-derived icon fix confirmed (uat-test9-oathbreaker-skull-icon.png). Boss sprite: PASS for **Sprint Demon** (correct winged-demon sprite, uat-p2-after-toggle.png). The **Technical Debt Golem** specifically was NOT spawned (boss assignment is per-level; Golem is a later boss) — its sprite-mismatch fix not directly confirmed end-to-end here; recommend a multi-level run or manual check that reaches the Golem.

### 10. Team display correctness (no stale teams)
expected: After players join, switch teams, or move, the team rosters always show the correct members — no stale/missing team membership. (Phase 49 MAINT-04 — three team-staleness bugs closed.)
result: PASS — 2 players, 3 team transitions exercised (Mira→QA, Preston→Spectators, Mira→Developers). Both clients (P1 host + P2) stayed perfectly in sync at every step — correct counts and member names, no stale/missing membership on either view. Phase 49 MAINT-04 confirmed. 2026-06-24.

### 11. Boss combat — attacks land, projectiles render, HP decrements
expected: Player basic attacks and abilities hit the boss; projectiles render at correct on-screen positions; boss HP decreases and phase transitions fire at the right thresholds. (Phase 49 dropped-boss-attack fix + Phase 51 coordinate helpers.)
result: PARTIAL — Battle started cleanly (Sprint Demon 141/141 HP, Phase 1 of 1), estimation→discussion→VICTORY transitions all fired correctly and the boss was defeated on estimation completion (8 story points). KEY LEARNING: boss HP/defeat is estimation-driven, not the shooting mechanic — Ctrl/click/Q shooting + projectiles are a cosmetic overlay and did NOT decrement boss HP (expected, per the model). Projectile on-screen positioning (Phase 51 coord helpers) was not visually captured this run. Phase transitions = PASS; projectile-render spot-check recommended manually.

### 12. Healer-only revival enforcement
expected: Only healer classes can revive a downed teammate; a non-healer attempting revival is rejected (no revive happens). (Phase 50 RevivalNotAllowedError hardening.)
result: NOT VERIFIED via automation — requires a downed teammate + a healer-class reviver + a non-healer rejection attempt. P2 auto-assigned Warrior (couldn't pick Cleric — see Test 6 secondary note), and no player was downed in the single-ticket battle. Server-side RevivalNotAllowedError unit tests pass per 52-VERIFICATION; live enforcement needs manual spot-check with a Cleric.

## Summary

total: 12
passed: 6            # Tests 1, 2, 4, 5, 6, 10 — fully verified
partial: 3          # Tests 3 (profiler gate), 9 (icon PASS, Golem sprite pending), 11 (transitions ok, projectiles pending)
not_verified: 3     # Tests 7, 8, 12 — combat/class/healer setup not drivable headlessly
issues: 5           # bugs/leads found (see Bugs Found)
skipped: 0
updated: 2026-06-24T21:00:00-06:00

# Verification re-run after fixes (branch fix/uat-v6-bugs):
#   - Bug #1 (remote avatar) FIXED + verified live: remote renders on join w/o moving.
#   - Test 4 targeted (freeze Mira), Test 5 non-host, Test 9 Oathbreaker 💀 icon: all newly PASS.

## Bugs Found

1. **Remote avatar invisible until move** (medium) — remote players don't render in the
   lobby tavern until their first movement broadcast. Root-caused to `Lobby.tsx:1548`
   (`if (!position) return null` gating on `playerPositions`). Pre-existing, NOT a Phase-52
   regression. Full notes + proposed fix: `.planning/bugs/lobby-remote-avatar-invisible-until-move.md`

2. **"Hit Tab for controls" throws an exception** (medium, long-standing) — two competing
   Tab handlers (PlayerController.tsx:127 debug modal + BattleScreen.tsx:164 TeamCompetition
   modal) both fire in battle phase. Couldn't capture an uncaught error in automation
   (likely React error-boundary-swallowed). Notes + fix plan:
   `.planning/bugs/tab-controls-modal-throws-exception.md`

## Gaps / Outstanding

- **60fps React DevTools Profiler** (Test 3) — the one human-only gate from 52-VERIFICATION;
  still requires a manual profiler pass on a running dev server.
- **Combat-dependent tests (7, 8, 12)** — need specific classes (Bard/Paladin/Oathbreaker/
  Cleric) + a downed-player state; the Join-Battle flow auto-assigned Warrior and skipped
  avatar selection (logged as a secondary lead in bug #1's notes). Server-side unit tests
  for these fixes already pass per 52-VERIFICATION.
- **Golem boss sprite (Test 9)** — needs a run where the Technical Debt Golem actually
  spawns (this run drew Sprint Demon, which rendered correctly).
- **Possible scale bug** — discussion-phase re-vote picker showed Fibonacci while the lobby
  scale was set to doubling (noted in Tab bug file; needs separate confirmation).
