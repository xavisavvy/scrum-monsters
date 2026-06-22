# Phase 47: Ability Effects & Data-Driven Registries - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Source:** Adversarial review council (`.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md`, ranks 1-followup, 2, 5, 16) — decisions are locked by the council's verified findings, not open for re-litigation.

<domain>
## Phase Boundary

**Goal:** Every ability `effectType` is honored (no silently-dropped buff/shield/debuff), and per-class/per-boss data lives in one `Record<Union,...>`-typed registry so adding a class/boss/effect is a compile-checked single-file change.

**In scope:**
1. Ability effect handler completeness — add `buff`/`shield`/`debuff` branches to the `ability:effect_applied` handler; forward `buffType`/`debuffType`/`durationMs` through the payload; deduplicate the heal loop.
2. Typed class registry — promote `AVATAR_CLASSES` to `Record<AvatarClass, ClassDef>`; derive `HEALER_CLASSES` and `getClassBaseDamage` from it; type client `AVATAR_IMAGES` as `Record<AvatarClass, string>`.
3. Typed boss registry — derive `SPRITE_TO_BOSS_TYPE` and `availableBosses` from `Object.values(BOSS_BEHAVIORS)`.
4. Narrow `buffType`/`debuffType` from bare `string` to literal unions.

**Out of scope (explicit):**
- **PR #167 (open, NOT merged as of planning) ships the two one-liner symptom fixes** (golem filename, monk icon) on a side branch. Phase 47's registry work **subsumes them at the root**: deriving `SPRITE_TO_BOSS_TYPE` from `BOSS_BEHAVIORS` (EXT-03) makes the golem key correct by construction, and a registry-carried `icon` (EXT-02) collapses the three hand-written `getClassIcon` maps into one lookup that includes `monk`. Net: do the registry work regardless of #167's merge status — if #167 merged first, the registry confirms/replaces those lines; if not, the registry fixes them. Do **not** plan standalone one-line edits that duplicate #167.
- Wiring NEW runtime consumers for buff types that have none today. Only `damage_boost` and `shield` are consumed by the existing buff system (`getDamageMultiplier`, `reduceShield`). Handlers must APPLY/store every buff with the correct type + duration, but building consumers for `crit_boost`/`dodge`/debuff effects is future work — store + emit them, do not fake-implement consumers.
- Adding `imagePath` to the shared module the server imports — `AVATAR_IMAGES` stays client-side.
- `CLASS_ABILITY_CONFIGS` — already `Record`-typed; leave it.
- The `bossType` wire union (server-private type) — not changed here (that is Phase 51's contract work).
</domain>

<decisions>
## Implementation Decisions (locked by the review council)

### EXT-01 — Ability effect completeness
- Extend `AbilityEffectAppliedPayload` (`shared/abilityTypes.ts`) with optional `buffType?`, `debuffType?`, `durationMs?`.
- `AbilityManager.applyAbilityEffect` (`server/domains/AbilityManager.ts`) forwards `abilityDef.buffType` / `abilityDef.debuffType` / `abilityDef.duration` into the emitted `ability:effect_applied` event.
- Add `buff` / `shield` / `debuff` branches to the `ability:effect_applied` handler (`server/domains/index.ts`, ~L420) mirroring the existing `item:effect_applied` handler (~L337). Branches read the new payload fields rather than hardcoding the buff type.
- Extract the duplicated heal loop (present in both the item and ability handlers) into a single `applyHealEffect` helper called by both.
- Audit the item handler's hardcoded `buffType: 'damage_boost'` — confirm it is correct or parameterize it.
- The 8 affected abilities: warrior `berserker_rage`, bard `inspire`, ranger `eagle_eye`, rogue `shadow_step`, wizard `time_warp`, paladin `holy_shield` / `divine_intervention`, oathbreaker `aura_of_dread`.
- **Sequencing (ordered, separate commits):** payload fields + forwarding FIRST, then the handler branches that read them.

### EXT-02 — Typed class registry
- Promote `AVATAR_CLASSES` to a canonical `Record<AvatarClass, ClassDef>` carrying `role` / `baseDamage` / `icon`.
- Derive `HEALER_CLASSES` as a filtered view of the registry; replace `getClassBaseDamage`'s switch with a property lookup.
- Retype client `AVATAR_IMAGES` to `Record<AvatarClass, string>` (kept client-side).
- Acceptance: adding a new `AvatarClass` without a registry entry is a `tsc` error.

### EXT-03 — Typed boss registry
- Derive `SPRITE_TO_BOSS_TYPE` and `availableBosses` from `Object.values(BOSS_BEHAVIORS)` (`server/domains/boss-ai/boss-definitions/index.ts`) so the sprite→type map cannot drift from the behavior table again (the class of bug PR #167 patched by hand).

### buffType / debuffType unions (rank 16, partial)
- Narrow `AbilityDefinition.buffType` / `debuffType` from bare `string` to literal unions matching the values actually used. Skip a `Record<BuffType, BuffApplicator>` dispatch table — premature with only two consumed buff types.

### Claude's Discretion
- Exact shape and home of `ClassDef` (and `BossDef`/`BossBehavior` field additions).
- Whether non-consumed buff types are stored-and-emitted with a `// TODO: consumer` marker or tracked in FUTURE-ENHANCEMENTS.
- Test file structure and the exact regression assertions (must cover: each of the 8 abilities applies its effect; a missing class entry fails `tsc`; boss-type derivation round-trips for all 5 bosses).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The review (source of truth for scope/decisions)
- `.planning/reviews/MAINTAINABILITY-REVIEW-2026-06-21.md` — Theme 6 + ranks 1-followup, 2, 5, 16. Read the "Theme 6" section and the rank 2/5 prioritized entries for the exact ordered steps and the debunked over-scopes.

### Ability effects (EXT-01)
- `server/domains/index.ts` — `ability:effect_applied` handler (~L420) and the `item:effect_applied` handler (~L337) to mirror; the shield monkey-patch (~L394) is Phase 48's concern, do not refactor it here.
- `server/domains/AbilityManager.ts` — `applyAbilityEffect` (~L233) emit site.
- `shared/abilityTypes.ts` — `AbilityEffectAppliedPayload` (~L345), `AbilityDefinition` (~L35, has `buffType?`/`debuffType?`/`duration`), `AbilityEffectType` (~L14), and `CLASS_ABILITIES` definitions.
- `shared/gameEvents.ts` — `ability:effect_applied` wire payload (~L550) and the `AvatarClass` union (~L155).
- `shared/socket-schemas.ts` — ability/avatar Zod schemas (keep wire parity if the payload type changes).

### Registries (EXT-02 / EXT-03) — locations corrected by 47-RESEARCH.md
- `shared/gameEvents.ts:706` — `AVATAR_CLASSES` (Record of 10 classes; promotion target — NOT `client/src/lib/gameTypes.ts`, which is a thin re-export).
- `client/src/lib/avatarImages.ts:4` — `AVATAR_IMAGES` (currently `Record<string,string>`; retype to `Record<AvatarClass,string>`).
- `server/domains/CombatManager.ts:171` — `HEALER_CLASSES` (private readonly); `:607` — `getClassBaseDamage` (4-case switch → registry lookup).
- `client/src/components/game/SpriteRenderer.tsx`, `client/src/components/game/Lobby.tsx`, and `CharacterDetailsPanel` each have a `getClassIcon` map (3 copies; CharacterDetailsPanel already has `monk: '🥋'`). The registry should collapse these to one `icon` source.
- `server/domains/boss-ai/boss-definitions/index.ts:45` — `SPRITE_TO_BOSS_TYPE` (hand-written, wrong golem key); `server/gameState.ts:1254-1280` — inline `availableBosses` array to derive/replace.
- `server/domains/boss-ai/types.ts:95` — `BossBehavior` (has **no** `sprite`/`description` fields; EXT-03 must add them to derive the map — planner's discretion: add to `BossBehavior` directly vs. a new `BossRegistry` type).

### Note on `AbilityDefinition` (corrected)
- `AbilityDefinition` has **no `duration` field** — EXT-01 must ADD `durationMs?` to it (the buff's active duration, distinct from `cooldownMs`). Forward that, not a nonexistent `duration`.

</canonical_refs>

<specifics>
## Specific Ideas

- Mirror the item handler's `addBuff(...)` calls for the `buff`/`shield` ability branches — `damage_boost` and `shield` already have working consumers, so `berserker_rage` (damage_boost) and `holy_shield` (shield) should start working end-to-end immediately after this phase.
- The `debuff` branch (e.g. oathbreaker `aura_of_dread` → `attack_slow`) applies to the boss/threat side; confirm whether a boss-debuff consumer exists before claiming it functional vs. stored.
- Keep `applyHealEffect` byte-identical to the current clamp loop so the `combat:player_healed` broadcast is unchanged.
</specifics>

<deferred>
## Deferred Ideas

- Runtime consumers for `crit_boost`, `dodge`, and boss debuff effects (track in FUTURE-ENHANCEMENTS if not consumed by end of phase).
- `Record<BuffType, BuffApplicator>` dispatch table (premature — revisit if buff-type count grows).
</deferred>

---

*Phase: 47-ability-effects-data-driven-registries*
*Context gathered: 2026-06-21 from the adversarial review council*
