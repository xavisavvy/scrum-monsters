# Phase 47: Ability Effects & Data-Driven Registries — Research

**Researched:** 2026-06-21
**Domain:** Server ability-effect dispatch / shared type registries / boss-AI definitions
**Confidence:** HIGH (all claims verified against live source code)

---

## Summary

Phase 47 has three independent workstreams, all in existing files with no new packages needed:

1. **EXT-01 (Ability effect completeness):** Eight abilities emit `ability:effect_applied` with `effectType` `'buff'` / `'shield'` / `'debuff'` but `AbilityManager.applyAbilityEffect` (`server/domains/AbilityManager.ts:246`) never forwards `buffType`, `debuffType`, or a buff-specific `durationMs` into the payload — so the handler in `server/domains/index.ts:420-457` has no data to act on even if branches existed. Fix requires two ordered steps: (a) add optional fields to `AbilityEffectAppliedPayload` and forward them from `AbilityManager`; (b) add `buff`/`shield`/`debuff` branches to the handler.

2. **EXT-02 (Typed class registry):** `AVATAR_CLASSES` lives in `shared/gameEvents.ts:706` typed as `Record<AvatarClass, { name, description, color, stats, specialties }>` — it does NOT carry `role`, `baseDamage`, or `icon`. `getClassBaseDamage` is a private switch in `server/domains/CombatManager.ts:607`. `HEALER_CLASSES` is a private constant in `CombatManager.ts:171`. `AVATAR_IMAGES` is in `client/src/lib/avatarImages.ts:4` typed `Record<string, string>`. The promotion adds `role` and `baseDamage` to the shared `AVATAR_CLASSES` type (keeping it in `shared/gameEvents.ts`), lets server derive `HEALER_CLASSES` and `getClassBaseDamage` from it, and retypes `AVATAR_IMAGES` to `Record<AvatarClass, string>`.

3. **EXT-03 (Typed boss registry):** `SPRITE_TO_BOSS_TYPE` in `server/domains/boss-ai/boss-definitions/index.ts:45` is a hand-written `Record<string, BossType>`. The golem filename mismatch (`'tech-debt-golem.png'` in the registry vs. `'technical-debt-golem.png'` everywhere else) was identified in the review but **PR #167 has NOT landed** — `git log` shows no golem/monk commit. Both the rank-1 immediate fix (filename) AND the rank-1 follow-up (derive from `Object.values(BOSS_BEHAVIORS)`) belong in Phase 47. `availableBosses` in `server/gameState.ts:1254` is a separate hand-written array that must also be deleted/derived.

**Primary recommendation:** Execute in strict commit order — payload fields first, handler branches second, registries third. No new npm packages.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**EXT-01 — Ability effect completeness**
- Extend `AbilityEffectAppliedPayload` (`shared/abilityTypes.ts`) with optional `buffType?`, `debuffType?`, `durationMs?`.
- `AbilityManager.applyAbilityEffect` (`server/domains/AbilityManager.ts`) forwards `abilityDef.buffType` / `abilityDef.debuffType` / `abilityDef.duration` into the emitted `ability:effect_applied` event.
- Add `buff` / `shield` / `debuff` branches to the `ability:effect_applied` handler (`server/domains/index.ts`, ~L420) mirroring the existing `item:effect_applied` handler (~L337). Branches read the new payload fields rather than hardcoding the buff type.
- Extract the duplicated heal loop (present in both the item and ability handlers) into a single `applyHealEffect` helper called by both.
- Audit the item handler's hardcoded `buffType: 'damage_boost'` — confirm it is correct or parameterize it.
- The 8 affected abilities: warrior `berserker_rage`, bard `inspire`, ranger `eagle_eye`, rogue `shadow_step`, wizard `time_warp`, paladin `holy_shield` / `divine_intervention`, oathbreaker `aura_of_dread`.
- **Sequencing (ordered, separate commits):** payload fields + forwarding FIRST, then the handler branches that read them.

**EXT-02 — Typed class registry**
- Promote `AVATAR_CLASSES` to a canonical `Record<AvatarClass, ClassDef>` carrying `role` / `baseDamage` / `icon`.
- Derive `HEALER_CLASSES` as a filtered view of the registry; replace `getClassBaseDamage`'s switch with a property lookup.
- Retype client `AVATAR_IMAGES` to `Record<AvatarClass, string>` (kept client-side).
- Acceptance: adding a new `AvatarClass` without a registry entry is a `tsc` error.

**EXT-03 — Typed boss registry**
- Derive `SPRITE_TO_BOSS_TYPE` and `availableBosses` from `Object.values(BOSS_BEHAVIORS)` (`server/domains/boss-ai/boss-definitions/index.ts`) so the sprite→type map cannot drift from the behavior table again (the class of bug PR #167 patched by hand).

**buffType / debuffType unions (rank 16, partial)**
- Narrow `AbilityDefinition.buffType`/`debuffType` from bare `string` to literal unions matching the values actually used. Skip a `Record<BuffType, BuffApplicator>` dispatch table — premature with only two consumed buff types.

### Claude's Discretion
- Exact shape and home of `ClassDef` (and `BossDef`/`BossBehavior` field additions).
- Whether non-consumed buff types are stored-and-emitted with a `// TODO: consumer` marker or tracked in FUTURE-ENHANCEMENTS.
- Test file structure and the exact regression assertions (must cover: each of the 8 abilities applies its effect; a missing class entry fails `tsc`; boss-type derivation round-trips for all 5 bosses).

### Deferred Ideas (OUT OF SCOPE)
- Runtime consumers for `crit_boost`, `dodge`, and boss debuff effects (track in FUTURE-ENHANCEMENTS if not consumed by end of phase).
- `Record<BuffType, BuffApplicator>` dispatch table (premature — revisit if buff-type count grows).
- The golem sprite filename fix and the `monk` icon — listed as "already shipped in PR #167" in CONTEXT.md, but **git log confirms PR #167 has NOT landed**. Phase 47 must include both the filename fix and the monk icon additions (they are one-liner commits).
- Adding `imagePath` to the shared module the server imports — `AVATAR_IMAGES` stays client-side.
- `CLASS_ABILITY_CONFIGS` — already `Record`-typed; leave it.
- The `bossType` wire union (server-private type) — not changed here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-01 | Ability effect completeness — `buff`/`shield`/`debuff` branches added to handler; `buffType`/`debuffType`/`durationMs` forwarded through payload | Handler gap confirmed at `server/domains/index.ts:420-457`; payload gap confirmed at `shared/abilityTypes.ts:345-352`; emit site at `AbilityManager.ts:246` |
| EXT-02 | Typed class registry — `AVATAR_CLASSES` → `Record<AvatarClass, ClassDef>`; derived `HEALER_CLASSES` and `getClassBaseDamage`; `AVATAR_IMAGES` retyped | `AVATAR_CLASSES` at `shared/gameEvents.ts:706`; `getClassBaseDamage` at `CombatManager.ts:607`; `HEALER_CLASSES` at `CombatManager.ts:171`; `AVATAR_IMAGES` at `avatarImages.ts:4` |
| EXT-03 | Typed boss registry — `SPRITE_TO_BOSS_TYPE` and `availableBosses` derived from `BOSS_BEHAVIORS` | Hand-written table at `boss-definitions/index.ts:45`; hand-written `availableBosses` at `gameState.ts:1254`; `BossBehavior` type at `boss-ai/types.ts:95` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ability effect dispatch | API/Server (`server/domains/index.ts`) | — | Server-authoritative; domain event bus routes effect to buff state |
| Buff state storage | API/Server (`server/domains/index.ts` module scope) | — | `activeBuffs` map lives server-side; no client state needed |
| Ability effect payload | Shared (`shared/abilityTypes.ts`) | Server event bridge (`server/events/ClientEventEmitter.ts`) | Payload is the wire contract; bridge must forward new fields |
| Class registry | Shared (`shared/gameEvents.ts`) | Server (`CombatManager.ts`), Client (multiple) | Shared because both server (damage calc) and client (UI) read it |
| Client avatar images | Client (`client/src/lib/avatarImages.ts`) | — | Image paths are client-only; server must not import them |
| Boss behavior registry | Server (`boss-definitions/index.ts`) | — | Server-only type; `BossType` is server-private per CONTEXT |
| Boss selection for new battle | Server (`server/gameState.ts`) | — | `availableBosses` currently inline here; derivation replaces it |
| Class icon emojis | Client (three files) | Shared (via `AVATAR_CLASSES.icon` after EXT-02) | Currently duplicated in 3 client files; EXT-02 consolidates to registry |

---

## EXT-01 — Ability Effect Handler: Exact Current State

### The Payload Gap (most important finding)

`AbilityEffectAppliedPayload` (`shared/abilityTypes.ts:345-352`) currently has:

```typescript
// shared/abilityTypes.ts:345
export interface AbilityEffectAppliedPayload {
  lobbyId: string;
  playerId: string;
  abilityId: string;
  effectType: AbilityEffectType;
  targetIds: string[];
  value: number;
}
```

Missing: `buffType?`, `debuffType?`, `durationMs?`. The CONTEXT.md refers to `abilityDef.duration` but **`AbilityDefinition` has no `duration` field** — it has `cooldownMs` (the ability's own cooldown). The planner must decide: add a `durationMs` field to `AbilityDefinition` (the buff's active duration) OR forward a computed value. Recommendation: add `durationMs?: number` to `AbilityDefinition` in `shared/abilityTypes.ts:35` alongside `buffType?`/`debuffType?`, then populate it for the 8 affected abilities in `CLASS_ABILITY_CONFIGS`. This is the cleanest approach since the buff duration is an ability property.

### The Emit Site Gap

`AbilityManager.applyAbilityEffect` (`server/domains/AbilityManager.ts:233-254`) emits:

```typescript
// server/domains/AbilityManager.ts:246
this.eventBus.emit('ability:effect_applied', {
  lobbyId,
  playerId,
  abilityId: abilityDef.id,
  effectType: abilityDef.effectType,
  targetIds,
  value: abilityDef.power,
  // buffType, debuffType, durationMs NOT forwarded
});
```

After payload extension, this must forward `buffType: abilityDef.buffType`, `debuffType: abilityDef.debuffType`, `durationMs: abilityDef.durationMs`.

### The Handler Gap

`server/domains/index.ts:420-457` (the `ability:effect_applied` handler):

```
Lines 420-424: 'damage' branch → calls combatManager.applyAbilityDamageToBoss
Lines 426-447: 'heal' branch → inline HP clamp + combat:player_healed emit
Lines 449-456: 'taunt' branch → recordThreat(500)
// 'buff', 'shield', 'debuff' branches: MISSING
```

### The Item Handler to Mirror (`server/domains/index.ts:337-378`)

```
Lines 338-356: 'heal' branch → HP clamp + combat:player_healed (IDENTICAL to ability heal)
Lines 358-366: 'buff' branch → addBuff(buffType: 'damage_boost', value, expiresAt)
Lines 368-376: 'shield' branch → addBuff(buffType: 'shield', value, expiresAt)
// 'debuff' branch: also MISSING from item handler
```

Critical note: the item handler's `buff` branch **hardcodes** `buffType: 'damage_boost'` (`server/domains/index.ts:363`). The ability handler must read `payload.buffType` instead — and the CONTEXT says to "audit" whether the item's hardcode is correct. It is correct for the current item set (items that grant buffs only grant `damage_boost`), but the ability handler must be parameterized.

### The 8 Silently-Dropped Abilities (verified from `shared/abilityTypes.ts`)

| # | Class | Ability ID | Effect Type | buffType / debuffType | Has consumer? |
|---|-------|-----------|------------|----------------------|---------------|
| 1 | warrior | `warrior_berserker_rage` | `buff` | `damage_boost` | YES (`getDamageMultiplier`) |
| 2 | bard | `bard_inspire` | `buff` | `damage_boost` | YES (`getDamageMultiplier`) |
| 3 | ranger | `ranger_eagle_eye` | `buff` | `crit_boost` | NO (store + emit only) |
| 4 | rogue | `rogue_shadow_step` | `buff` | `dodge` | NO (store + emit only) |
| 5 | wizard | `wizard_time_warp` | `buff` | `cooldown_reduction` | NO (store + emit only) |
| 6 | paladin | `paladin_holy_shield` | `shield` | — (no buffType field) | YES (`reduceShield`) |
| 7 | paladin | `paladin_divine_intervention` | `shield` | — (no buffType field) | YES (`reduceShield`) |
| 8 | oathbreaker | `oathbreaker_aura_of_dread` | `debuff` | `attack_slow` | NO (store + emit only) |

Notes:
- `paladin_holy_shield` and `paladin_divine_intervention` have no `buffType` field in their definition — the `addBuff` call for shields always uses `buffType: 'shield'` (hardcoded in the item handler, correct).
- `warrior_berserker_rage` and `bard_inspire` will become functionally complete end-to-end after this phase (`damage_boost` consumer exists).
- `paladin_holy_shield` / `paladin_divine_intervention` will become functionally complete (`shield` consumer exists).
- `ranger_eagle_eye`, `rogue_shadow_step`, `wizard_time_warp`, `oathbreaker_aura_of_dread` will be stored and emitted but have no consumer — mark with `// TODO: consumer in future phase`.

### The Duplicate Heal Loop

The heal loop is identical in both handlers (`server/domains/index.ts:338-356` and `426-447`):

```typescript
for (const targetId of payload.targetIds) {
  const combatState = combatManager.getCombatState(payload.lobbyId);
  if (!combatState) break;
  const targetState = combatState.players.get(targetId);
  if (targetState && targetState.combatState === 'fighting') {
    const oldHp = targetState.hp;
    targetState.hp = Math.min(targetState.maxHp, targetState.hp + payload.value);
    const actualHeal = targetState.hp - oldHp;
    if (actualHeal > 0) {
      eventBus.emit('combat:player_healed', { ... });
    }
  }
}
```

Extract as `applyHealEffect(lobbyId, targetIds, value, healerId)` — a module-private function in `server/domains/index.ts` alongside `addBuff`/`reduceShield`.

### Wire Parity Impact

The `ability:effect_applied` wire event in `shared/gameEvents.ts:550-558` must gain the same new optional fields when `AbilityEffectAppliedPayload` gains them. The `ClientEventEmitter` bridge at `server/events/ClientEventEmitter.ts:487-495` currently does NOT forward any new fields — it must be updated to include `buffType`, `debuffType`, `durationMs`.

`socket-schemas.ts` has no Zod schema for the server-to-client `ability:effect_applied` event (only `ClientEventSchemas` covers client→server events). No schema change is needed there.

The client does **not** currently listen to `ability:effect_applied` — confirmed by grep. Adding optional fields to the wire payload is additive and safe.

---

## EXT-02 — Class Registry: Exact Current State

### Where Things Live (corrected from CONTEXT.md's prediction)

The CONTEXT.md listed `client/src/lib/gameTypes.ts` as containing `AVATAR_CLASSES`, `AVATAR_IMAGES`, `getClassBaseDamage`, `HEALER_CLASSES`. **This is wrong.** Actual locations:

| Symbol | File | Line | Current Type |
|--------|------|------|-------------|
| `AVATAR_CLASSES` | `shared/gameEvents.ts` | 706 | `Record<AvatarClass, { name, description, color, stats, specialties }>` |
| `AvatarClass` | `shared/gameEvents.ts` | 155 | `type AvatarClass = "ranger" \| "rogue" \| ... \| "monk"` (10 classes) |
| `HEALER_CLASSES` | `server/domains/CombatManager.ts` | 171 | `private readonly HEALER_CLASSES: AvatarClass[] = ['cleric', 'paladin', 'bard']` |
| `getClassBaseDamage` | `server/domains/CombatManager.ts` | 607 | `private getClassBaseDamage(avatarClass, masteryMultiplier): number` — switch statement |
| `AVATAR_IMAGES` | `client/src/lib/avatarImages.ts` | 4 | `Record<string, string>` (not typed to `AvatarClass`) |
| `getClassIcon` (primary) | `client/src/components/game/SpriteRenderer.tsx` | 110 | `Record<string, string>` — 9 classes, MISSING `monk` |
| `getClassIcon` (secondary) | `client/src/components/game/Lobby.tsx` | 1690 | `Record<string, string>` — 9 classes, MISSING `monk` |
| `getClassIcon` (complete) | `client/src/components/game/CharacterDetailsPanel.tsx` | 92 | `Record<AvatarClass, string>` — all 10 classes including `monk: '🥋'` |
| `gameTypes.ts` | `client/src/lib/gameTypes.ts` | 1 | Re-exports `shared/gameEvents.ts` only; contains `GameClient`, `AttackAnimation`, `SoundEffect` |

### ClassDef Shape Decision

The planner must add `role` and `baseDamage` (and `icon`) to `AVATAR_CLASSES`. The `ClassDef` shape should be:

```typescript
type ClassRole = 'tank' | 'healer' | 'dps';

interface ClassDef {
  name: string;
  description: string;
  color: string;
  stats: CharacterStats;
  specialties: string[];
  role: ClassRole;          // NEW — used to derive HEALER_CLASSES
  baseDamage: number;       // NEW — used to derive getClassBaseDamage
  icon: string;             // NEW — consolidates getClassIcon from 3 places
}
```

The existing fields stay so no consumer breaks. `baseDamage` values from `CombatManager.ts:610-638`:
- `warrior`, `paladin`, `oathbreaker`: 15 (tank)
- `ranger`, `rogue`, `monk`: 20 (DPS)
- `sorcerer`, `wizard`: 25 (glass cannon)
- `cleric`, `bard`: 12 (healer)

`HEALER_CLASSES` becomes: `Object.entries(AVATAR_CLASSES).filter(([, def]) => def.role === 'healer').map(([cls]) => cls as AvatarClass)`.

### Consumer Blast Radius (must all still compile)

Consumers of `AVATAR_CLASSES` — all read existing fields, all survive field additions without changes:
- `client/src/components/game/AvatarSelection.tsx:24,70` — reads `.color`, iterates entries
- `client/src/components/game/CharacterDetailsPanel.tsx:11` — reads full def
- `client/src/components/game/Lobby.tsx:24,1688` — reads `.color`, `.name`
- `client/src/components/game/PlayerHUD.tsx:72,84` — reads `.color`, `.name`
- `client/src/components/game/PlayerCharacter.tsx:61` — reads full def
- `client/src/components/utils/CharacterTools.tsx:231,611` — iterates keys

Consumers requiring update:
- `server/domains/CombatManager.ts:607-641` — `getClassBaseDamage` switch becomes `AVATAR_CLASSES[avatarClass]?.baseDamage ?? 20`
- `server/domains/CombatManager.ts:171` — `HEALER_CLASSES` constant becomes derived from registry
- `client/src/lib/avatarImages.ts:4` — retype `AVATAR_IMAGES` from `Record<string, string>` to `Record<AvatarClass, string>`
- `client/src/components/game/SpriteRenderer.tsx:110-123` — `getClassIcon` can delegate to `AVATAR_CLASSES[avatarClass].icon`
- `client/src/components/game/Lobby.tsx:1690-1703` — `getClassIcon` can delegate to `AVATAR_CLASSES[avatarClass]?.icon`
- `client/src/components/game/CharacterDetailsPanel.tsx:92-106` — already complete; remove in favor of registry

---

## EXT-03 — Boss Registry: Exact Current State

### The Mismatch (live bug, NOT fixed by PR #167)

`server/gameState.ts:1271` emits sprite `'technical-debt-golem.png'` for battle init.
`server/domains/boss-ai/boss-definitions/index.ts:49` registers `'tech-debt-golem.png'` (missing `nical`).

Result: `getBossTypeFromSprite('technical-debt-golem.png')` returns `null` → `CombatManager` falls back to `'bug-hydra'` → Tech Debt Golem runs Bug Hydra AI. **This is still a live bug.**

Fix per review: change `boss-definitions/index.ts:49` from `'tech-debt-golem.png'` to `'technical-debt-golem.png'`.

### What `BossBehavior` Carries (from `server/domains/boss-ai/types.ts:95-100`)

```typescript
export interface BossBehavior {
  bossType: BossType;           // present
  name: string;                  // present
  patterns: AttackPattern[];     // present
  phaseTransitionMessages: Record<BossPhaseNumber, string>; // present
  // sprite: NOT present
  // description: NOT present
}
```

`BossBehavior` does NOT have `sprite` or `description`. The `availableBosses` array in `gameState.ts:1254-1280` carries `{ sprite, name, description }` for each boss. To derive `availableBosses` from `BOSS_BEHAVIORS`, two fields must be added to `BossBehavior` (or a separate registry type used).

**Planner decision required:** The CONTEXT.md says the planner has discretion on "exact shape and home of `BossDef`/`BossBehavior` field additions." Options:

Option A (simpler): Add `sprite: string` and `description: string` directly to `BossBehavior` in `server/domains/boss-ai/types.ts` and populate in each boss definition file.

Option B (cleaner separation): Create a separate `BOSS_REGISTRY` typed `Record<BossType, { sprite: string; description: string }>` alongside `BOSS_BEHAVIORS` in `boss-definitions/index.ts`, derive both `SPRITE_TO_BOSS_TYPE` and `availableBosses` from it.

Option A is recommended: fewer files, `BossBehavior` stays the single source for a boss's data-driven properties.

### Where `availableBosses` Is Consumed

Currently only in `server/gameState.ts:1254-1283`. The derivation replaces this inline array:

```typescript
// Current (gameState.ts:1254)
const availableBosses = [
  { sprite: 'bug-hydra.png', name: 'Bug Hydra', description: '...' },
  ...
];

// After EXT-03 derivation
import { BOSS_BEHAVIORS } from './domains/boss-ai';
const availableBosses = Object.values(BOSS_BEHAVIORS);
// then selectedBoss.sprite / selectedBoss.name / selectedBoss.description
```

The boss selection at `gameState.ts:1283` uses `.sprite`, `.name`, `.description` — these must be present on the derived `BossBehavior` values.

### `SPRITE_TO_BOSS_TYPE` Derivation

After adding `sprite` to `BossBehavior`, derivation in `boss-definitions/index.ts`:

```typescript
// Derived — cannot drift from BOSS_BEHAVIORS
export const SPRITE_TO_BOSS_TYPE: Record<string, BossType> = Object.fromEntries(
  Object.values(BOSS_BEHAVIORS).map(b => [b.sprite, b.bossType])
);
```

This replaces the 5-entry hand-written table.

---

## buffType / debuffType Literal Unions (Rank 16)

Current values in `CLASS_ABILITY_CONFIGS` (`shared/abilityTypes.ts`):
- `buffType`: `'damage_boost'` (warrior, bard), `'crit_boost'` (ranger), `'dodge'` (rogue), `'cooldown_reduction'` (wizard)
- `debuffType`: `'attack_slow'` (oathbreaker)

Current `AbilityDefinition.buffType?: string; debuffType?: string;` — bare strings.

Narrowing:
```typescript
export type BuffType = 'damage_boost' | 'crit_boost' | 'dodge' | 'cooldown_reduction';
export type DebuffType = 'attack_slow';

// In AbilityDefinition:
buffType?: BuffType;
debuffType?: DebuffType;
```

The `activeBuffs` map in `server/domains/index.ts:220-226` already uses a narrower union `'damage_boost' | 'shield'` for `ActiveBuff.buffType`. After the handler adds buff branches, the map stores all consumed types. Non-consumed `BuffType` values (`crit_boost`, `dodge`, `cooldown_reduction`) are stored but never queried — this is acceptable.

---

## Monk Icon: Current State (PR #167 NOT landed)

`SpriteRenderer.tsx:110-123` `getClassIcon` — 9-entry `Record<string, string>`, missing `monk`.
`Lobby.tsx:1690-1703` `getClassIcon` — 9-entry `Record<string, string>`, missing `monk`.
`CharacterDetailsPanel.tsx:92-106` `getClassIcon` — 10-entry `Record<AvatarClass, string>`, HAS `monk: '🥋'`.

The monk icon is `'🥋'` (from `CharacterDetailsPanel`). EXT-02 absorbs these three icon maps into `AVATAR_CLASSES.icon` eliminating the duplication, but the monk one-liner fix must go in whichever commit comes first.

---

## Tests: Existing Infrastructure and Patterns

### Existing test files to mirror/extend

| Test File | What It Tests | Pattern to Reuse |
|-----------|--------------|-----------------|
| `server/domains/AbilityManager.test.ts` | Cooldowns, mastery gating, effect emission | `ScopedEventBus` + mock `combatManager` deps |
| `server/domains/CombatManager.test.ts` | HP, team attacks, healer checks | Direct `CombatManager` instantiation |
| `server/domains/boss-ai/BossAI.test.ts` | Boss type → behavior round-trip | `new BossAI(bossType)` |

The AbilityManager test at L272-407 already tests `ability:effect_applied` emission for `buff`, `shield`, and `debuff` effect types — those tests verify the event is emitted but do NOT test that the handler in `index.ts` processes them (because `index.ts` module-level handlers run only when the module is imported, not in isolated unit tests). New tests for handler behavior (EXT-01 regression) should follow the `CombatManager.test.ts` pattern: instantiate dependencies directly, stub `eventBus`, verify state mutations.

### Required New Tests

| Requirement | Test | File |
|-------------|------|------|
| EXT-01: berserker_rage applies damage_boost | `eventBus.on('ability:effect_applied', ...)` → `getDamageMultiplier > 1.0` | `server/domains/AbilityEffectHandler.test.ts` (new) |
| EXT-01: holy_shield applies shield absorption | same pattern, `getShieldAbsorption > 0` | same |
| EXT-01: aura_of_dread stores debuff (no crash) | same pattern, no error | same |
| EXT-01: heal loop deduplicated — single combat:player_healed per target | spy on `eventBus.emit` | same |
| EXT-02: missing AvatarClass entry is tsc error | `satisfies Record<AvatarClass, ClassDef>` assertion | compile-time only |
| EXT-02: HEALER_CLASSES derived correctly | `expect(HEALER_CLASSES).toContain('cleric')` | `shared/gameEvents.test.ts` (new) |
| EXT-02: getClassBaseDamage via registry matches old switch | value parity test for all 10 classes | `server/domains/CombatManager.test.ts` (extend) |
| EXT-03: all 5 SPRITE_TO_BOSS_TYPE entries present | `Object.keys(SPRITE_TO_BOSS_TYPE).length === 5` | `server/domains/boss-ai/BossAI.test.ts` (extend) |
| EXT-03: golem sprite round-trips | `getBossTypeFromSprite('technical-debt-golem.png') === 'tech-debt-golem'` | same |

The handler tests cannot easily use the module-level `server/domains/index.ts` singletons without triggering the monkey-patch (rank 14 concern). Recommended: extract the handler logic into testable pure functions (`applyAbilityEffect(payload, combatManager, activeBuffs)`) — or test via the existing `abilityManager.useAbility` → eventBus → `index.ts` integration path by importing the whole module and spying on the eventBus. The integration approach is simpler for Phase 47.

---

## Architecture Patterns

### Existing `addBuff` Signature

```typescript
// server/domains/index.ts:236
function addBuff(lobbyId: string, playerId: string, buff: Omit<ActiveBuff, 'timeoutHandle'>): void
```

Where `ActiveBuff.buffType: 'damage_boost' | 'shield'`. After EXT-01 adds `debuff` tracking, `buffType` may need to widen OR a separate `activeDebuffs` map is used. Recommendation: keep `activeBuffs` for player buffs only (consumed types: `damage_boost`, `shield`); add a separate `activeDebuffs` map for boss debuffs (`attack_slow`). This preserves the narrowly-typed `ActiveBuff` without widening.

### Item Handler Structure to Mirror

```typescript
// server/domains/index.ts:337
eventBus.on('item:effect_applied', (payload) => {
  if (payload.effectType === 'heal') {
    applyHealEffect(payload.lobbyId, payload.targetIds, payload.value, payload.playerId);
  } else if (payload.effectType === 'buff') {
    addBuff(payload.lobbyId, payload.playerId, {
      buffType: payload.buffType ?? 'damage_boost',  // after audit: still hardcode for items
      value: payload.value,
      expiresAt: Date.now() + (payload.durationMs ?? 10000),
      ...
    });
  } else if (payload.effectType === 'shield') {
    addBuff(payload.lobbyId, payload.playerId, {
      buffType: 'shield',
      value: payload.value,
      expiresAt: Date.now() + (payload.durationMs ?? 15000),
      ...
    });
  }
});
```

The ability handler mirrors this, except `buffType` reads from `payload.buffType` (not hardcoded), and adds a `debuff` branch.

---

## Wire Schema Parity Checklist

When `AbilityEffectAppliedPayload` gains `buffType?`, `debuffType?`, `durationMs?`:

| File | Current State | Required Change |
|------|--------------|-----------------|
| `shared/abilityTypes.ts:345` | Payload type — missing 3 fields | ADD optional fields |
| `shared/abilityTypes.ts:35` | `AbilityDefinition` — missing `durationMs?` | ADD `durationMs?: number` |
| `server/domains/AbilityManager.ts:246` | Emits without 3 fields | FORWARD new fields |
| `server/events/ClientEventEmitter.ts:487` | Bridge — forwards only 5 fields | ADD 3 optional fields to bridge spread |
| `shared/gameEvents.ts:550` | Wire event — missing 3 fields | ADD optional fields to wire type |
| `server/events/eventTypes.ts:580` | Re-exports payload type | No change — re-export auto-inherits |
| `shared/socket-schemas.ts` | No schema for `ability:effect_applied` (server→client only) | No change needed |
| Client handler | Does not exist | No change |

`npm run check` will catch any mismatch at the TypeScript level since `AbilityEffectAppliedPayload` is the internal bus type and `ServerToClientEvents['ability:effect_applied']` is the wire type — they are separate. Both must be updated.

---

## Confirmed Current State of PR #167

PR #167 is referenced in STATE.md as shipped but does NOT appear in `git log`. The two fixes described as "already shipped":
1. Golem sprite filename — `boss-definitions/index.ts:49` still reads `'tech-debt-golem.png'` (**bug is live**)
2. Monk icon in `SpriteRenderer.tsx` — `getClassIcon` still has 9 entries, missing `monk` (**bug is live**)

Phase 47 must include both one-liner fixes. They should be in the first commit of EXT-03 (golem sprite) and EXT-02 (monk icon) respectively.

---

## Common Pitfalls

### Pitfall 1: Wrong forwarding source for `durationMs`
**What goes wrong:** Using `abilityDef.cooldownMs` instead of a new `abilityDef.durationMs` for the buff duration. The `cooldownMs` is the ability's reuse timer; the buff should have its own separate active duration.
**Why it happens:** The current `AbilityDefinition` only has `cooldownMs`. The CONTEXT.md references `abilityDef.duration` which does not exist.
**How to avoid:** Add `durationMs?: number` to `AbilityDefinition` and populate it for the 8 affected abilities before touching the emit site.

### Pitfall 2: Forgetting the `ClientEventEmitter` bridge
**What goes wrong:** Adding fields to `AbilityEffectAppliedPayload` and the emit site but forgetting `server/events/ClientEventEmitter.ts:487-495`. The bridge explicitly destructures fields — new optional fields are silently dropped.
**Warning signs:** `npm run check` passes but clients never see `buffType` on the wire. Add the new fields to the bridge spread as part of step 1.

### Pitfall 3: Breaking `activeBuffs` type with debuff entries
**What goes wrong:** Adding `debuffType` buff entries to `activeBuffs` which is typed `'damage_boost' | 'shield'` for `BuffType`. A `debuff` branch that calls `addBuff` with `buffType: 'attack_slow'` will be a TypeScript error.
**How to avoid:** Add a separate `activeDebuffs` map for boss-targeted debuffs OR widen `ActiveBuff.buffType` to include consumed debuff types. Since debuffs have no consumer yet, a separate `activeDebuffs: Map<string, DebuffEntry[]>` is cleanest.

### Pitfall 4: Double-breaking `getClassBaseDamage` migration
**What goes wrong:** `CombatManager.getClassBaseDamage` is called in 3 places (`CombatManager.ts:536`, `CombatManager.ts:658`, `CombatManager.ts:901`). Missing one leaves a stale switch.
**How to avoid:** Search for all 3 call sites before migrating. The method stays private on `CombatManager` (signature unchanged); only the body changes from a switch to a property lookup.

### Pitfall 5: Partial monk icon fix
**What goes wrong:** Fixing `SpriteRenderer.tsx` but not `Lobby.tsx:1690`. Or fixing both without EXT-02 absorbing them into the registry, leaving duplicate icon maps.
**How to avoid:** If EXT-02 is done in the same phase, the preferred sequence is: fix monk in both files in one commit, then the EXT-02 registry promotion deletes the ad-hoc maps and replaces with `AVATAR_CLASSES[cls].icon`.

### Pitfall 6: `AVATAR_CLASSES` import on the server breaks if `imagePath` is added
**What goes wrong:** `AVATAR_CLASSES` is in `shared/gameEvents.ts` imported by both client and server. If `icon` field references emoji strings (fine) or adds `imagePath` (disallowed by CONTEXT). Emojis are valid cross-environment strings.
**How to avoid:** `icon` field holds emoji string only. Never add `imagePath` to `AVATAR_CLASSES`.

---

## Sequencing Recommendation (Commit Order)

The CONTEXT.md mandates payload BEFORE handlers for EXT-01. Suggested commit sequence:

```
Commit 1 (EXT-01a): Add BuffType/DebuffType unions + durationMs? to AbilityDefinition +
                    AbilityEffectAppliedPayload + wire type + bridge
                    → npm run check must pass; no behavior change

Commit 2 (EXT-01b): Add buff/shield/debuff branches to ability:effect_applied handler +
                    extract applyHealEffect + audit item handler buff hardcode
                    → behavior change: warrior/paladin/bard buffs now apply

Commit 3 (EXT-02):  Add role/baseDamage/icon to AVATAR_CLASSES entries +
                    export ClassDef type + fix monk icons in SpriteRenderer + Lobby +
                    migrate CombatManager.getClassBaseDamage + HEALER_CLASSES +
                    retype AVATAR_IMAGES
                    → npm run check must pass; no runtime behavior change

Commit 4 (EXT-03):  Fix golem sprite key in boss-definitions/index.ts +
                    add sprite/description to BossBehavior + populate in all 5 files +
                    derive SPRITE_TO_BOSS_TYPE from Object.values(BOSS_BEHAVIORS) +
                    delete availableBosses inline array in gameState.ts, import derivation
                    → behavior change: golem runs correct AI
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 47 is code/type changes only. No external tools, services, or CLIs required beyond the project's own `npm run check` and `npm test`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (colocated `.test.ts`) |
| Config file | `vite.config.ts` (Vitest configured inline) |
| Quick run command | `npx vitest run server/domains/AbilityManager.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-01 | buff/shield/debuff handler branches apply effects | integration | `npx vitest run server/domains/AbilityEffectHandler.test.ts` | NO — Wave 0 |
| EXT-01 | applyHealEffect called by both handlers (no duplicate) | unit | same file | NO — Wave 0 |
| EXT-02 | AVATAR_CLASSES typed correctly (tsc) | compile | `npm run check` | implicit |
| EXT-02 | getClassBaseDamage returns correct values | unit | `npx vitest run server/domains/CombatManager.test.ts` | YES — extend |
| EXT-02 | HEALER_CLASSES derived from registry | unit | `npx vitest run shared/gameEvents.test.ts` | NO — Wave 0 |
| EXT-03 | SPRITE_TO_BOSS_TYPE has all 5 bosses | unit | `npx vitest run server/domains/boss-ai/BossAI.test.ts` | YES — extend |
| EXT-03 | getBossTypeFromSprite('technical-debt-golem.png') === 'tech-debt-golem' | unit | same | YES — extend |

### Wave 0 Gaps
- [ ] `server/domains/AbilityEffectHandler.test.ts` — covers EXT-01 buff/shield/debuff handler branches + heal dedup
- [ ] `shared/gameEvents.test.ts` — covers EXT-02 HEALER_CLASSES derivation

---

## Security Domain

No new authentication, session management, cryptography, or untrusted input is introduced. All changes are internal server-side type and logic refactors. `ability:effect_applied` is not a client-to-server event — it is a server-internal domain event and a server-to-client broadcast. The `use_ability` client event (already in `ClientEventSchemas` with `UseAbilityPayloadSchema`) is the only client-facing ability event; it is already validated.

---

## Open Questions (RESOLVED — decided during planning, baked into PLAN.md)

1. **Debuff active duration tracking** → **RESOLVED:** separate `activeDebuffs` map (47-02), with matching setTimeout cleanup in `session:lobby_destroyed`. Does not pollute the narrowly-typed player `ActiveBuff`.

2. **`addBuff` for `crit_boost` / `dodge` / `cooldown_reduction`** → **RESOLVED:** store-and-emit via `addBuff` with `ActiveBuff.buffType` widened to `BuffType | 'shield'` (47-02), each tagged `// TODO: consumer in future phase`. Keeps all 8 abilities on one code path.

3. **`BossBehavior` vs. new `BossRegistry` type** → **RESOLVED:** Option A — `sprite`/`description` added directly to `BossBehavior` (47-04), fewest files.

4. **`availableBosses` deletion in `gameState.ts`** → **RESOLVED:** 47-04 Task 3 derives `availableBosses` from `Object.values(BOSS_BEHAVIORS)` and adds the import (the `gameState.ts` → `server/domains/boss-ai` import path is already established, no cycle).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PR #167 (golem fix + monk icon) has NOT landed — confirmed by git log | EXT-03, EXT-02 | If it did land on a branch not yet merged, work would duplicate. Planner should check `git log --all --oneline \| grep 167` before writing those tasks. |
| A2 | `AbilityDefinition` has no existing `durationMs`/`duration` field | EXT-01 | Verified from source read — no risk |
| A3 | No client handler exists for `ability:effect_applied` | Wire Parity | Verified by grep — no risk |
| A4 | `AVATAR_CLASSES` is in `shared/gameEvents.ts`, NOT `client/src/lib/gameTypes.ts` | EXT-02 | Verified — `gameTypes.ts` is a thin re-export. No risk. |

---

## Sources

### Primary (HIGH confidence — verified from source code)
- `shared/abilityTypes.ts` — `AbilityDefinition`, `AbilityEffectAppliedPayload`, `CLASS_ABILITY_CONFIGS` all 10 classes
- `server/domains/index.ts` — full `ability:effect_applied` and `item:effect_applied` handlers, `addBuff`, `reduceShield`
- `server/domains/AbilityManager.ts` — `applyAbilityEffect` emit site
- `shared/gameEvents.ts:706-786` — `AVATAR_CLASSES` full definition, `AvatarClass` union at L155
- `server/domains/CombatManager.ts:607-641,171` — `getClassBaseDamage` switch, `HEALER_CLASSES`
- `client/src/lib/avatarImages.ts` — `AVATAR_IMAGES` type
- `server/domains/boss-ai/boss-definitions/index.ts` — `BOSS_BEHAVIORS`, `SPRITE_TO_BOSS_TYPE`, `getBossTypeFromSprite`
- `server/domains/boss-ai/types.ts` — `BossBehavior` interface (confirmed: no `sprite`/`description`)
- `server/gameState.ts:1254-1283` — `availableBosses` inline array
- `server/events/ClientEventEmitter.ts:487-495` — bridge for `ability:effect_applied`
- `shared/gameEvents.ts:550-558` — wire type for `ability:effect_applied`
- `client/src/components/game/SpriteRenderer.tsx:110-123` — missing monk in `getClassIcon`
- `client/src/components/game/Lobby.tsx:1690-1703` — missing monk in `getClassIcon`
- `client/src/components/game/CharacterDetailsPanel.tsx:92-106` — complete `getClassIcon` with monk
- `git log` — confirmed PR #167 not in commit history

### Secondary (derived from source)
- Review council report `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md` — Theme 6, ranks 1, 2, 5, 16

---

## Metadata

**Confidence breakdown:**
- Ability effect gap (EXT-01): HIGH — handler source read line by line; payload structure verified
- Class registry locations (EXT-02): HIGH — CONTEXT.md file locations were wrong; corrected from direct reads
- Boss registry (EXT-03): HIGH — sprite mismatch confirmed live; `BossBehavior` struct verified
- PR #167 status: HIGH — `git log` definitively shows it has not landed

**Research date:** 2026-06-21
**Valid until:** This research is code-anchored with specific line numbers. Valid until any of the named files change materially. Re-verify line numbers before plan execution if more than 3 days elapse.
