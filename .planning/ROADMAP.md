# Roadmap: ScrumQuest

## Milestones

- ✅ **v1.0 Domain Separation** — Phases 1-6 (shipped 2026-02-02)
- ✅ **v1.2 SDLC Best Practices** — Phases 7-14 (shipped 2026-02-03)
- ✅ **v1.3 Game Progression** — Phases 15-20 (shipped 2026-02-11)
- ✅ **v2.0 UI Redesign & Mobile** — Phases 21-25 (shipped 2026-02-19)
- ✅ **v3.0 Production Optimization** — Phases 26-29 (shipped 2026-02-20)
- ✅ **v3.1 Tech Debt Cleanup** — Phases 30-31 (completed 2026-02-24, 1 plan deferred)
- ✅ **v4.0 Hosting & Deployment** — Phases 32-36 (shipped 2026-03-11)
- ✅ **v5.0 UX & Onboarding** — Phases 37-46 (shipped 2026-06-17)
- 🚧 **v6.0 Maintainability & Extensibility** — Phases 47-52 (planning; seeded by the 2026-06-21 adversarial review council)

## Phases

<details>
<summary>✅ v1.0 Domain Separation (Phases 1-6) — SHIPPED 2026-02-02</summary>

See `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 SDLC Best Practices (Phases 7-14) — SHIPPED 2026-02-03</summary>

See `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Game Progression (Phases 15-20) — SHIPPED 2026-02-11</summary>

See `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 UI Redesign & Mobile (Phases 21-25) — SHIPPED 2026-02-19</summary>

See `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.0 Production Optimization (Phases 26-29) — SHIPPED 2026-02-20</summary>

See `.planning/milestones/v3.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.1 Tech Debt Cleanup (Phases 30-31) — SHIPPED 2026-02-24</summary>

See `.planning/milestones/v3.1-ROADMAP.md`

</details>

<details>
<summary>✅ v4.0 Hosting & Deployment (Phases 32-36) — SHIPPED 2026-03-11</summary>

See `.planning/milestones/v4.0-ROADMAP.md`

- [x] Phase 32: Infrastructure Foundation (3/3 plans) — completed 2026-03-02
- [x] Phase 33: Production Hardening (2/2 plans) — completed 2026-03-03
- [x] Phase 34: CI/CD Pipeline (3/3 plans) — completed 2026-03-09
- [x] Phase 35: Observability (3/3 plans) — completed 2026-03-09
- [x] Phase 36: Disaster Recovery (3/3 plans) — completed 2026-03-10

</details>

### ✅ v5.0 UX & Onboarding (Shipped 2026-06-17)

**Milestone Goal:** Make ScrumQuest welcoming to new players and polished for everyone — tutorial system, contextual hints, smooth transitions, meaningful error/empty states, and responsive interaction feedback. (Phases 45-46 — socket schema reconciliation and music controls — landed under this milestone as it extended.)

- [x] **Phase 37: State Polish & Bug Fixes** — Graceful handling of every app state plus known bug fixes (completed 2026-03-11)
- [x] **Phase 38: Interaction Feedback & Transitions** — Responsive micro-interactions, toast notifications, and cinematic phase transitions (completed 2026-03-11)
- [x] **Phase 39: Tutorial Foundation** — Tutorial infrastructure (store, overlays, hint system) and help menu (completed 2026-05-15; Gap #1 resolved via mount + phase-resolution + hydration fixes, commit 3fcbcc1)
- [x] **Phase 40: Tutorial Content & JRPG Narrator** — Phase-aware walkthroughs, contextual hints, and narrator dialogue boxes (plans complete 2026-05-07; pending /gsd-verify-work)
- [x] **Phase 41: Reconnection State Bugfix** — Fix stale lobby snapshot/reconnect-token causing duplicate self and lost host status on rejoin (completed 2026-05-06)

## Phase Details

### Phase 37: State Polish & Bug Fixes
**Goal**: Every screen handles empty, loading, and error states gracefully with JRPG theming, and known bugs are resolved
**Depends on**: Nothing (first phase of milestone)
**Requirements**: POLISH-01, POLISH-02, POLISH-03, FIX-01, FIX-02
**Success Criteria** (what must be TRUE):
  1. User sees themed empty state messages with actionable CTAs when lobby has no players, no tickets, no abilities, or empty scoreboard
  2. User sees skeleton loading placeholders for lobby player list and a themed spinner during battle preparation (no blank screens or raw "Loading..." text)
  3. User sees a JRPG-styled error fallback with retry button when any phase component crashes, and the rest of the app continues working
  4. User can click "New Game" on the victory screen and it works (server handler exists and responds)
  5. Developer menu Character Tools and Boss Tools buttons either function correctly or are removed
**Plans**: 2 plans

Plans:
- [x] 37-01: Empty states and loading skeletons
- [x] 37-02: Error boundaries and bug fixes

### Phase 38: Interaction Feedback & Transitions
**Goal**: Every user action produces immediate visual feedback, and phase changes feel cinematic
**Depends on**: Phase 37 (error boundaries must exist before adding animations that could mask errors)
**Requirements**: FEED-01, FEED-02, FEED-03, POLISH-04
**Success Criteria** (what must be TRUE):
  1. User sees press/spring-back animation on game buttons and glow/bounce feedback when selecting a vote card
  2. User receives toast notifications for key events: score submitted, reconnected, settings saved, ability used
  3. User sees a brief confirmation flash and cooldown progress indicator when activating a combat ability
  4. User sees JRPG interstitial screens during phase transitions (e.g., "Encounter!", "Victory!", "Tallying results...") that are short and non-blocking
**Plans**: 3 plans

Plans:
- [x] 38-01: Button animations and vote card feedback
- [x] 38-02: Toast notifications and ability confirmation
- [x] 38-03: JRPG phase transition interstitials

### Phase 39: Tutorial Foundation
**Goal**: Tutorial infrastructure is built and verified — isolated store, overlay system, hint targeting, and help menu — ready for content
**Depends on**: Phase 37 (empty/loading/error states provide stable rendering context for overlays)
**Requirements**: TUTR-04
**Success Criteria** (what must be TRUE):
  1. A `useTutorial` Zustand store exists, fully isolated from `useGameState`, with localStorage persistence for tutorial/hint completion state
  2. SpotlightMask and HintBubble overlay components render as siblings to PhaseRenderer (not children), with their own AnimatePresence context
  3. Key game elements have `data-hint-target` attributes and the hint system can locate and position overlays relative to them
  4. User can open a help menu from a button in the game UI that allows re-triggering the tutorial walkthrough
**Plans**: 2 plans

Plans:
- [ ] 39-01-PLAN.md — Tutorial store and hint targeting infrastructure
- [ ] 39-02-PLAN.md — Spotlight overlay, help menu, and game UI mounting

### Phase 40: Tutorial Content & JRPG Narrator
**Goal**: First-time players receive guided walkthroughs and contextual hints delivered through JRPG narrator characters
**Depends on**: Phase 39 (tutorial infrastructure must exist before defining content that uses it)
**Requirements**: TUTR-01, TUTR-02, TUTR-03
**Success Criteria** (what must be TRUE):
  1. First-time user sees a phase-aware spotlight walkthrough in lobby, avatar selection, and battle phases that is skippable and remembers completion across sessions
  2. User sees one-time contextual hints on first encounter with advanced features (first combo, first item drop, first boss telegraph) that auto-dismiss and never repeat
  3. All tutorial text and contextual hints appear in JRPG dialogue box style with typewriter text effect and narrator characters (Guild Master, Battle Advisor, Sage)
  4. Tutorial walkthrough steps auto-skip if their target element is not rendered (content cannot diverge from actual UI)
**Plans**: TBD

Plans:
- [x] 40-01: Tutorial walkthrough content and contextual hints (completed 2026-05-07)
- [x] 40-02: JRPG narrator dialogue boxes and typewriter effect (completed 2026-05-07)

### Phase 41: Reconnection State Bugfix
**Goal**: A returning player rejoins the same lobby with their original identity and host status, with no duplicate avatars and no stale snapshot/token state
**Depends on**: Phase 39 (tutorial work touches PlayerHUD/PlayerController focus paths; resolve after to avoid conflicts)
**Requirements**: FIX-03 (new — to be added to REQUIREMENTS.md when planning starts)
**Success Criteria** (what must be TRUE):
  1. `scrum-monsters-current-lobby` and `scrum-monsters-lobby-snapshot` localStorage entries always reference the same `lobbyId`; mismatched/stale snapshots are cleared on detection
  2. Reconnecting to a lobby restores the original player (no duplicate self appears in the player list/teams)
  3. The original host retains `isHost: true` after reconnect, instead of being reattached as a non-host
  4. `reconnectToken` is invalidated and removed once it expires or once the matching lobby/player is gone server-side
  5. Repro is a closed regression: stop dev server during an active lobby, restart, reload tab — single self in roster, host preserved

**Repro evidence (2026-05-06):**
  - `scrum-monsters-current-lobby` → lobby `MT1Q4L`
  - `scrum-monsters-lobby-snapshot` → lobby `36I0RL` (different)
  - `reconnectToken` was scoped to `36I0RL`
  - Result: duplicate self in roster, original host status lost on rejoin
**Plans**: TBD (1-2 plans expected: snapshot/token cleanup + reconnect handler integrity)

Plans:
- [x] 41-01: Lobby snapshot/token consistency and stale-state cleanup (completed 2026-05-06)
- [x] 41-02: Reconnect handler — preserve identity and host status (completed 2026-05-06)

### Phase 42: v5.0 Pre-Ship Fixes & Polish
**Goal**: Resolve three open gameplay/UX defects flagged late in milestone v5.0 so the milestone ships clean: boss damage actually lands on player HP, auto-advance is either restored as a real Lobby setting or fully removed, and XP gain pacing feels right.
**Depends on**: Phase 40 (tutorial work touches BattlePhase + game UI surfaces; resolve after to avoid conflicts)
**Requirements**: FIX-04, FIX-05, BAL-01
**Success Criteria** (what must be TRUE):
  1. Boss attacks — single-target AND area-of-effect — correctly decrement affected players' HP server-side; client HUD reflects the damage; verified by repro test that hit a player and asserts `player.hp` decreased
  2. The runtime warning `Received deprecated lobby_updated event` no longer fires from `client/src/pages/GamePage.tsx`; either the deprecated handler and all server emitters of `lobby_updated` are removed (event fully retired in favor of fine-grained events), or the handler is restored as a non-deprecated path with the warning removed
  3. Auto-advance is either (a) a working Lobby UI setting wired end-to-end (toggle in Lobby → server respects it on consensus and voting timeout) and persisted with other lobby settings, or (b) fully removed (no orphan client setting state, no dead server code) — pick one based on assessment, do not leave half-implemented
  4. XP per-action awards and the level-up XP curve are reviewed; pacing tuning lands as a single commit with before/after curve documented in the plan SUMMARY (no untouched-but-claimed-fixed paths)
  5. No regressions: existing combat tests, Phase 40 tutorial tests, and Phase 41 reconnection tests all still pass

**Plans**: 4 plans

Plans:
- [x] 42-01-PLAN.md — Boss damage client feedback (HP bar + damage popups wired to combat:player_damaged) (completed 2026-05-07)
- [x] 42-02a-PLAN.md — Auto-advance Lobby UI toggle (host-only, default OFF, persisted with lobby settings) (completed 2026-05-07)
- [x] 42-02b-PLAN.md — Retire deprecated lobby_updated event (migrate 26 server emit sites to fine-grained events) (completed 2026-05-07)
- [x] 42-03-PLAN.md — XP gain pacing tuning (XP_RATES.boss_damage 2->1; curve exponent 1.5->1.8; before/after table in SUMMARY) (completed 2026-05-07)

### Phase 43: Auth & User Account Validation
**Goal**: A user clicking "Sign In" on the home page can actually sign in, the resulting session is recognized end-to-end, and account-tied features (stats, profile, persistent identity) work — current behavior loops back to the sign-in button.
**Depends on**: none (independent of Phase 42 fixes)
**Requirements**: AUTH-01
**Success Criteria** (what must be TRUE):
  1. Clicking "Sign In" from `UserMenu` (which redirects to `/api/auth/login`) completes the Auth0 round-trip and returns the user to the app authenticated — no redirect loop, no return-to-Sign-In button after callback
  2. After a successful login, `/api/auth/me` returns the authenticated user, `useAuth().user` is populated client-side, and the avatar dropdown replaces the "Sign In" button on next render
  3. Sign-out via the dropdown clears the session and returns the user to anonymous-play state without errors
  4. Account-tied surfaces that depend on `user`/`stats` (profile, stats dialog) render correctly when authenticated and gracefully fall back when anonymous
  5. Required Auth0 env vars (`AUTH0_CLIENT_ID`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_SECRET`, `AUTH0_CLIENT_SECRET`, `BASE_URL`) are documented in `.env.example` and the app surfaces a clear error (not a silent loop) if any are missing in dev/staging/prod
  6. Anonymous play continues to work — no auth requirement was accidentally introduced

**Plans:** 2 plans
- [x] 43-01-PLAN.md — Graceful unconfig UX (useAuth providersConfigured + UserMenu render gate) (completed 2026-05-08)
- [x] 43-02-PLAN.md — Configured-path integration tests + env hardening (supertest, mockOidc, route/component/store tests, AUTH0_* all-or-nothing) (completed 2026-05-08)

### Phase 44: Zero-Downtime Deploys (Blue-Green)
**Goal**: Deploys do not produce a 502 Bad Gateway window for users. The new image runs alongside the old, becomes healthy, then NPM (nginx-proxy-manager) swaps upstream — old container stops only after the swap. No more ~15-30s "Bad Gateway" gap users currently see during every deploy.
**Depends on**: Phase 42 (deploy workflow currently has the docker prune step that this phase will extend), Phase 43 (auth + reconnection paths must continue to work across the deploy swap)
**Requirements**: INFRA-01
**Success Criteria** (what must be TRUE):
  1. A continuous request stream (e.g. `while true; do curl /api/health; done`) during a deploy never sees a non-2xx response — zero dropped requests
  2. WebSocket connections in flight at deploy time either survive the swap or reconnect gracefully via the existing Phase 41 reconnection machinery (no duplicate-self / lost-host regression)
  3. Deploy script supports an explicit rollback: if the new color fails its health check, NPM upstream stays on the old color and the deploy aborts cleanly
  4. NPM admin credentials are stored as a CI secret (NPM_ADMIN_EMAIL, NPM_ADMIN_PASSWORD) and used to authenticate API calls from the deploy script
  5. State of which color is active persists across deploys (e.g. `/opt/scrummonsters/.active-color` file), so subsequent deploys correctly target the inactive color
  6. Compose changes preserve the existing single-host / postgres-on-network architecture — no Swarm, no Kubernetes
  7. Phase 39/40/41/42/43 invariants must continue to pass under repeated deploys

**Plans**: 3 plans

Plans:
- [x] 44-01-PLAN.md — Compose blue-green topology + NPM image pin + Wave 0 discovery script + stale-snapshot toast UX
- [x] 44-02-PLAN.md — NPM REST API helper module + healthcheck poll module + Bats tests + CI shellcheck/bats gate
- [x] 44-03-PLAN.md — Deploy orchestrator + auto-rollback + manual rollback script + workflow wiring + operator runbook

### Phase 45: Socket Schema Drift Reconciliation
**Goal**: `shared/gameEvents.ts` (the typed `ServerToClientEvents` / `ClientToServerEvents` contracts) agrees with what the server actually emits and what the client actually reads. Three known runtime bugs (silent boss-heal HP corruption, timer state lost on resume, hardcoded revive HP that drifts for non-100-maxHp classes) get fixed. Two confirmed-broken features (multiplayer revive UX, YouTube music sync) get their handlers wired. One missing-feedback feature (cleric heal-party) gets a `combat:player_healed` event + floating-heal popup. ~17 dead events (emit-without-listener) are removed. After the phase, the client `Socket` can be typed `Socket<ServerToClientEvents, ClientToServerEvents>` — clearing the 43 `any` warnings exempted by the per-file ESLint override in `eslint.config.mjs` and surfacing future drift at compile time.
**Depends on**: Phase 42 (fine-grained event bus is the architecture this phase reconciles against)
**Success Criteria** (what must be TRUE):
  1. C1, C2, C3, C5 (the four real runtime bugs) are fixed with regression test coverage. C6 is documented and resolved (currently functionally correct because no PvP damage flow exists)
  2. `boss_ring_attack` schema matches the emit+handler reality; no `as any` workarounds remain for ring attack
  3. The `as any` legacy emit family in `server/websocket.ts` (H1: estimation_started, vote_state_updated, timer_paused/resumed/extended, estimate_forced) is deleted
  4. The 11 H5 SAFE_TO_DELETE legacy emits are removed; H2 consensus_countdown_update, H3 estimation:discussion_started, H9 session:player_reconnected dead type cleaned up
  5. Revival UX: peers see who is reviving whom, the per-tick progress bar works (via new `combat:revival_progress` event), and cancel shows feedback
  6. YouTube sync: host music plays on all peer clients
  7. Heal-party: cleric heals show a floating-heal popup on each healed player (via new `combat:player_healed` event)
  8. The 4-file `no-explicit-any: off` ESLint override is gone, both client and server sockets are typed via the schema, and the 43 `(data: any) =>` annotations in `eventHandlers.ts` are inferred
  9. `clientEvents.ts` is deleted (absorbed into `gameEvents.ts`); single source of truth for socket types
  10. `npm run lint` reports 0 problems, `npm run check` is clean, all tests pass, smoke test of lobby/battle/reveal/discussion + revive + heal-party + youtube-host-music passes

**Plans**: 5 plans (overview in [45-CONTEXT.md](phases/45-socket-schema-drift-reconciliation/45-CONTEXT.md); drift inventory in [45-RESEARCH.md](phases/45-socket-schema-drift-reconciliation/45-RESEARCH.md); H5 verdicts in [45-H5-TRIAGE.md](phases/45-socket-schema-drift-reconciliation/45-H5-TRIAGE.md))

Plans (wave 1 = 45-01/02/03 parallel-safe; wave 2 = 45-04 after 45-03; wave 3 = 45-05 last):
- [x] 45-01-PLAN.md — Critical handler/emit hot-fixes (C1 boss_healed, C2/C3 timer state, C5 revive HP) — completed 2026-05-17 (d48195d)
- [x] 45-02-PLAN.md — Rewrite `boss_ring_attack` schema to match emit + handler reality (C4) — completed 2026-05-17 (0781236)
- [x] 45-03-PLAN.md — Delete confirmed-dead wire traffic (H1 as-any family, H2/H3/H9, 11 H5 SAFE_TO_DELETE events) — completed 2026-05-17 (6cf8008)
- [x] 45-04-PLAN.md — Restore broken features (revival UX with new combat:revival_progress, YouTube sync handlers, combat:player_healed + floating-heal popup) — completed 2026-05-17 (2d76510)
- [x] 45-05-PLAN.md — Type the socket, remove the ESLint override, dedupe clientEvents.ts, sweep all Low items, address C6 — completed 2026-05-18 (feb94b1 + 4b1f483 + 0240117)

### Phase 46: Music Controls & History
**Goal**: Persistent music controls accessible from both Lobby and BattleScreen, with a YouTube URL input, live sync to all players, and a top-10 recently-used history stored per-host (showing video title, not raw URL).
**Depends on**: Phase 45 (YouTube sync handlers wired)
**Requirements**: MUSIC-01, MUSIC-02, MUSIC-03, MUSIC-04, MUSIC-05
**Plans:** 3 plans

Plans:
- [x] 46-01-PLAN.md — Utility helpers: musicHistory localStorage (save/load/trim), oEmbed title fetch, URL helpers (extractVideoId, extractPlaylistId, isPlaylistUrl, truncateUrl)
- [x] 46-02-PLAN.md — MusicControls.tsx component: host write + non-host read-only, oEmbed title, history dropdown, playlist note
- [x] 46-03-PLAN.md — Wiring: hoist YoutubeAudioPlayer to GamePage, swap BattleScreen controls, add to Lobby, delete BossMusicControls

---

### 🚧 v6.0 Maintainability & Extensibility (Planning)

**Milestone Goal:** Pay down the structural debt the 2026-06-21 adversarial review council identified — **without regressing performance** — so that adding a feature (socket event, avatar class, boss, ability, spell) becomes a compile-checked, single-file, safe change instead of error-prone shotgun surgery. Source of record: [`.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md`](reviews/MAINTAINABILITY-REVIEW-2026-06-21.md) (32 verified findings; performance guardian cleared every item — guardrails are acceptance criteria, not blockers).

**Sequencing principle (from the review):** consolidate state and build test seams *before* the large refactors; add data/payload fields *before* the handlers that read them; extract god-component seams *last*, only the verified ones.

- [x] **Phase 47: Ability Effects & Data-Driven Registries** — Make every ability effect actually apply; give per-class/per-boss data a single typed source of truth (Theme 6; ranks 2, 5, 16-part) (completed 2026-06-22)
- [x] **Phase 48: Testability Seams** — Constructable singletons, kill the runtime monkey-patch, `wireDomains` factory, mock-socket handler tests (Theme 7; rank 14) (completed 2026-06-23)
- [ ] **Phase 49: State Source-of-Truth Consolidation** — Derive `teams[]`, make CombatManager the single boss-HP truth, field-scoped Zustand selectors (Theme 1; ranks 3, 4, 8)
- [ ] **Phase 50: Finish the GameState → Domain-Manager Migration** — Ordered, reversible decommission of dead/duplicate GameState code; revival migration + `session:host_transferred` (Theme 2; ranks 9, 10)
- [ ] **Phase 51: Event-Contract Hardening & Handler Boilerplate** — Typed emit, `satisfies` parity guards, `Sequenced<T>`, `registerSyncedLobbyHandler` helpers (Themes 4 & 5; ranks 12, 13)
- [ ] **Phase 52: Client God-Component Decomposition** — Movement refs, magic-effect reducer, verified Lobby.tsx seams, PlayerController dedup + coordinate helpers (Theme 3; ranks 6, 7, 11, 15)

### Phase 47: Ability Effects & Data-Driven Registries
**Goal**: Every ability `effectType` is honored (no silently-dropped buff/shield/debuff), and per-class/per-boss data lives in one `Record<Union,...>`-typed registry so adding a class/boss/effect is a compile-checked single-file change.
**Depends on**: none (independent — leads the milestone; absorbs the live ability-effect bug deferred from PR #167)
**Requirements**: EXT-01 (ability effect completeness), EXT-02 (typed class registry), EXT-03 (typed boss registry)
**Success Criteria** (what must be TRUE):
  1. The 8 abilities emitting `buff`/`shield`/`debuff` (warrior berserker_rage, bard inspire, ranger eagle_eye, rogue shadow_step, wizard time_warp, paladin holy_shield/divine_intervention, oathbreaker aura_of_dread) apply their effect; `AbilityEffectAppliedPayload` carries `buffType?`/`debuffType?`/`durationMs?` and `AbilityManager` forwards them; the duplicated heal loop is one `applyHealEffect` helper
  2. `AVATAR_CLASSES` is `Record<AvatarClass, ClassDef>` with role/baseDamage/icon; `HEALER_CLASSES` and `getClassBaseDamage` derive from it; adding a class without an entry is a `tsc` error (client `AVATAR_IMAGES` typed `Record<AvatarClass,string>`, kept client-side)
  3. `SPRITE_TO_BOSS_TYPE` and `availableBosses` derive from `Object.values(BOSS_BEHAVIORS)` (the rank-1 follow-up to the filename fix shipped in PR #167)
  4. `buffType`/`debuffType` are literal unions, not bare `string`; no regressions (existing ability/combat tests pass)
**Plans**: 4 plans

Plans (wave 1 = 47-01/04 parallel-safe; wave 2 = 47-02/03 after 47-01 — 47-03 shares shared/gameEvents.ts with 47-01 so it follows, not parallel):
- [x] 47-01-PLAN.md — EXT-01a: ability-effect payload + wire + bridge fields, BuffType/DebuffType unions, durationMs forwarding (no behavior change)
- [x] 47-02-PLAN.md — EXT-01b: buff/shield/debuff handler branches, applyHealEffect dedup, activeDebuffs map, 8-ability regression suite
- [x] 47-03-PLAN.md — EXT-02: AVATAR_CLASSES -> Record<AvatarClass, ClassDef> (role/baseDamage/icon), derive HEALER_CLASSES + getClassBaseDamage, retype AVATAR_IMAGES, collapse 3 getClassIcon maps (fixes monk)
- [x] 47-04-PLAN.md — EXT-03: add sprite/description to BossBehavior, derive SPRITE_TO_BOSS_TYPE + availableBosses from BOSS_BEHAVIORS (fixes golem AI), 5-boss round-trip test

### Phase 48: Testability Seams
**Goal**: Core server logic (GameState, domain wiring, socket handlers) is reachable by unit tests with byte-identical production behavior — the safety net every later refactor depends on.
**Depends on**: none (pure-refactor seams; should land before Phases 49-52)
**Requirements**: MAINT-01 (constructable GameState), MAINT-02 (first-class damageInterceptor), MAINT-03 (wireDomains factory + mock-socket)
**Success Criteria** (what must be TRUE):
  1. `GameStateManager` is exported and constructable with `{ startWatchdogs?: boolean }` (default true); `handleVotingTimeout` is public; tests instantiate it with no `as any` and no leaked timers
  2. The module-scope monkey-patch of `combatManager.applyDamageToPlayer` is replaced by a first-class `damageInterceptor` dependency, with all 7 internal `applyDamageToPlayer` call sites verified to route through it (shield absorption no longer ships untested)
  3. Domain wiring is a `wireDomains(deps): { dispose() }` factory (production call at module bottom unchanged); a server-side `makeMockSocket` enables unit tests for `create_lobby`, disconnect/host-transfer, and `reconnect_with_token`
  4. No runtime behavior change; full suite still green
**Plans**: 3 plans

Plans (wave 1 = 48-01/48-02 parallel-safe; wave 2 = 48-03 after 48-01 + 48-02 because it edits server/domains/index.ts shared with 48-02 and its handler tests rely on 48-01 exported GameStateManager):
- [x] 48-01-PLAN.md: MAINT-01 export GameStateManager + startWatchdogs opt + public handleVotingTimeout + seam tests
- [x] 48-02-PLAN.md: MAINT-02 first-class damageInterceptor dep, route all 7 call sites, delete monkey-patch, wire shield at construction, interceptor test
- [x] 48-03-PLAN.md: MAINT-03 wireDomains factory (9 named listeners + dispose), server-side makeMockSocket, extract + test create_lobby / disconnect-host-transfer / reconnect_with_token

### Phase 49: State Source-of-Truth Consolidation
**Goal**: Each piece of game state has one authoritative store; handlers stop hand-mirroring, closing the existing team-staleness and boss-HP-divergence bugs.
**Depends on**: Phase 48 (characterization tests pin behavior before consolidation)
**Requirements**: MAINT-04 (team derivation), MAINT-05 (single boss-HP truth), MAINT-06 (scoped selectors)
**Success Criteria** (what must be TRUE):
  1. `withTeamsDerived(lobby)` recomputes `teams` from `players` and is threaded through every player-mutating `setLobby` — including the currently-unmirrored `session:avatar_selected` and `session:host_changed` — closing the `team_changed` push-before-map bug; covered by a unit test + regression test
  2. `CombatManager` is the single source of boss HP via `applyBasicDamageToBoss`; `gameState.attackBoss` delegates to it; basic attacks now trigger `checkPhaseTransition`; the manual `eventBus.emit('combat:boss_damaged')` at `websocket.ts` ~L1169 is removed so there is no double-emit
  3. Hot battle components use field-scoped Zustand selectors (scalar primitives, `useShallow` only for multi-field destructures), starting with `PlayerCharacter` + fixing `PlayerController`'s whole-store subscription so `React.memo` can bail out
  4. **Perf guardrail (acceptance criterion):** no selector returns a fresh object per render; a single boss hit no longer re-renders the whole battle tree
**Plans**: TBD

### Phase 50: Finish the GameState → Domain-Manager Migration
**Goal**: The stalled monolith→domain-manager migration is completed in an ordered, reversible way; dead/duplicate GameState code and redundant background loops are removed.
**Depends on**: Phases 48, 49 (test seams + state consolidation in place)
**Requirements**: MAINT-07 (decommission dead methods + alias fix), MAINT-08 (revival migration + host_transferred event)
**Success Criteria** (what must be TRUE):
  1. `syncPlayerToLobby` registers the alias unconditionally (fixes the latent reconnect staleness) — done *first*, before any deletion
  2. The proven-dead duplicate methods (`createLobby`/`joinLobby`/`removePlayer`/`updatePlayerTeam`/`updatePlayerAvatar`) are deleted after an identical-shape audit; timer/jira/estimation settings migrate cleanly into `SessionManager`; **battle methods (`attackBoss`/`startBattle`/`submitScore`/`revealScores`) are explicitly NOT shim-migrated** (left for a dedicated ownership-transfer design)
  3. All revival traffic routes through `CombatManager`; the redundant gameState revival watchdog and the `websocket.ts` legacy watchdog are gone (two 100ms ticks → zero); a new `session:host_transferred` eventBus event removes the `io.to(...).emit` from the disconnect sweeper
  4. No regression in reconnection (Phase 41 invariants), revival, or host-transfer behavior
**Plans**: TBD

### Phase 51: Event-Contract Hardening & Handler Boilerplate
**Goal**: Adding or changing a fine-grained socket event produces a `tsc` error on mismatch instead of a silent production drift (the C1/C2/C3/C5 bug class); the ~50 copy-pasted client handler envelopes collapse into tested helpers.
**Depends on**: Phase 49 (helpers route lobby writes through `withTeamsDerived`)
**Requirements**: EXT-04 (compile-time event contract), MAINT-09 (handler helpers + teardown), MAINT-10 (coordinate helpers)
**Success Criteria** (what must be TRUE):
  1. `emitFineGrained`/`emitToLobby` are constrained to `keyof ServerToClientEvents`; a `satisfies` guard cross-checks the `ClientEventEmitter` bridge against the wire-bound event union; `ClientEventSchemas` has `satisfies Record<keyof ClientToServerEvents, z.ZodTypeAny>` + a key-set parity test
  2. Wire unions are substituted where a domain union exists (`itemType: ItemType`, `avatar`/`avatarClass: AvatarClass`); a `Sequenced<T>` wrapper types the ~40 fine-grained events (control messages excluded). Server-private types (`bossType`) and the mis-cited minion `attackType` are explicitly NOT changed
  3. `registerSyncedLobbyHandler` and `registerSyncedHandler` own the seq-guard + null-check + setLobby envelope for the ~40 uniform handlers; the ~7 intentionally-non-standard handlers stay explicit; the hand-synced teardown off-list is replaced by a registered-name array (or a CI on()/off() parity test)
  4. `worldToPercent`/`percentToWorld` helpers replace the 5 open-coded coordinate sites with consistent clamping; no wire or runtime change
**Plans**: TBD

### Phase 52: Client God-Component Decomposition
**Goal**: `Lobby.tsx` (2862 lines) and `PlayerController.tsx` shrink along the *verified* seams, isolating re-render scope and making spells/movement testable — without touching the 60fps loops' performance.
**Depends on**: Phases 48 (tests), 49 (state consolidation), 51 (movement reads ride the new helpers)
**Requirements**: MAINT-11 (movement-loop refs), MAINT-12 (magic-effect reducer), MAINT-13 (Lobby seam extraction), MAINT-14 (PlayerController dedup)
**Success Criteria** (what must be TRUE):
  1. The 16ms movement `useEffect` no longer recreates on buff/jump changes — buff Sets and `jumpState.jumpHeight` are refs, dep array collapsed; a fake-timers test asserts one interval per movement session (same fix in `PlayerController`)
  2. The 13 magic-effect `useState` slots become one `useReducer` (`BuffState`/`BuffAction`); the ~300-line `if`-cascade becomes `detectedEffects.forEach(e => dispatch(buildAction(e, resolveTargets(e))))`; reducer is unit-tested; `DISPEL_ALL` is one action
  3. Verified seams extracted: `applySpellEffects`+`resolveTargets` dedup, `TavernLighting`, `LobbySettingsDialog` (host+phase guard preserved exactly), `LobbyAvatar` (explicit props, not an `isLocal` flag), and `useLobbyMovement` *last*. The debunked seams (unified emote spell hook, descriptor settings form, afterimage "dup") are deliberately left alone
  4. `PlayerController` Ctrl-shoot logic (3× verbatim) → `handleShootAtTarget`; the two cooldown tickers → `startCooldown`
  5. **Perf guardrail (acceptance criterion):** `dpr`+`PerformanceMonitor` live *inside* the extracted scene (Canvas never a controlled prop-receiver); extracted scene is `React.memo`'d; React DevTools profiler confirms render counts did not increase
**Plans**: TBD

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 30/30 | Complete | 2026-02-02 |
| 7-14 | v1.2 | 21/21 | Complete | 2026-02-03 |
| 15-20 | v1.3 | 28/28 | Complete | 2026-02-11 |
| 21-25 | v2.0 | 23/23 | Complete | 2026-02-19 |
| 26-29 | v3.0 | 9/9 | Complete | 2026-02-20 |
| 30-31 | v3.1 | 3/4 (1 deferred) | Complete | 2026-02-24 |
| 32-36 | v4.0 | 14/14 | Complete | 2026-03-11 |
| 37. State Polish & Bug Fixes | v5.0 | 2/2 | Complete | 2026-03-11 |
| 38. Interaction Feedback & Transitions | v5.0 | 3/3 | Complete | 2026-03-11 |
| 39. Tutorial Foundation | v5.0 | 2/2 | Complete | 2026-05-15 |
| 40. Tutorial Content & JRPG Narrator | v5.0 | 2/2 | Complete | 2026-05-07 |
| 41. Reconnection State Bugfix | v5.0 | 2/2 | Complete | 2026-05-06 |
| 42. v5.0 Pre-Ship Fixes & Polish | v5.0 | 4/4 | Complete | 2026-05-07 |
| 43. Auth & User Account Validation | v5.0 | 2/2 | Complete | 2026-05-07 |
| 44. Zero-Downtime Deploys (Blue-Green) | v5.0 | 3/3 | Complete | 2026-05-09 |
| 45. Socket Schema Drift Reconciliation | v5.0 | 5/5 | Complete | 2026-05-18 |
| 46. Music Controls & History | v5.0 | 3/3 | Complete | 2026-06-17 |
| 47. Ability Effects & Data-Driven Registries | v6.0 | 4/4 | Complete   | 2026-06-22 |
| 48. Testability Seams | v6.0 | 3/3 | Complete   | 2026-06-23 |
| 49. State Source-of-Truth Consolidation | v6.0 | 0/TBD | Planned | - |
| 50. Finish GameState → Domain-Manager Migration | v6.0 | 0/TBD | Planned | - |
| 51. Event-Contract Hardening & Handler Boilerplate | v6.0 | 0/TBD | Planned | - |
| 52. Client God-Component Decomposition | v6.0 | 0/TBD | Planned | - |

**Total: 9 milestones shipped, 46 phases complete, 155 plans (1 deferred) | v5.0 shipped 2026-06-17; v6.0 (Phases 47-52) in planning**

---
*Roadmap created: 2026-02-11*
*Last updated: 2026-06-21 — v5.0 marked shipped (Phases 37-46 reconciled; Phase 45 row restored, Phase 46 re-tagged v5.0); v6.0 Maintainability & Extensibility milestone added (Phases 47-52) from the adversarial review council in `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md`*
