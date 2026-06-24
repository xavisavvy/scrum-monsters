/**
 * applySpellEffects — MAINT-12 pure helpers for spell dispatch.
 *
 * No hooks. Pure functions: resolveTargets + buildAction + applySpellEffects.
 * isLocalCast boolean threads the ONE real divergence between handleLobbyEmote
 * (remote, isLocalCast=false) and handleEmoteSubmit (local, isLocalCast=true):
 * on earthbind/dispel when the caster is a flyer, only the local path calls
 * setFlyHeight(0).
 */

import type { MagicEffectType } from '@/lib/utils/magicWords';
import { getSpellWords, extractSpellTargets } from '@/lib/utils/magicWords';
import type { BuffAction } from '@/lib/reducers/buffReducer';
import type { Player } from '@/lib/gameTypes';

// ─── resolveTargets ──────────────────────────────────────────────────────────

/**
 * Resolve target player IDs for a spell effect.
 * Mirrors the inline resolveTargets at Lobby.tsx L853–873 (remote) and
 * L1346–1366 (local) — both are identical in logic.
 *
 * Returns matched IDs when message names players, otherwise [casterPlayerId].
 */
export function resolveTargets(
  effectType: MagicEffectType,
  message: string,
  casterPlayerId: string,
  lobbyPlayers: Player[],
): string[] {
  const spellWords = getSpellWords(effectType);
  const targetNames = extractSpellTargets(message, spellWords);

  if (!targetNames) {
    return [casterPlayerId]; // No targets in message — self-cast
  }

  const targetIds: string[] = [];
  for (const name of targetNames) {
    const player = lobbyPlayers.find(
      p => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (player) {
      targetIds.push(player.id);
    }
  }

  return targetIds.length > 0 ? targetIds : [casterPlayerId];
}

// ─── buildAction ─────────────────────────────────────────────────────────────

/**
 * Map a detected MagicEffectType + resolved targets to the correct BuffAction.
 *
 * For non-targeted effects (massacre, earthbind, massrevive, dragon, chaos),
 * targets / lobbyPlayers are used to derive victim lists.
 *
 * invisiblePlayersRef is passed so BREAK_INVISIBILITY can be emitted when an
 * invisible player casts any non-invisibility spell.
 */
export function buildAction(
  effect: MagicEffectType,
  targets: string[],
  casterPlayerId: string,
  isLocalCast: boolean,
  invisiblePlayers: Set<string>,
  lobbyPlayers: Player[],
): BuffAction {
  // Special case: if the caster is invisible and casting a non-invisibility spell,
  // return BREAK_INVISIBILITY (will be dispatched before other effects if needed).
  // NOTE: The caller (applySpellEffects) handles this separately as a trailing dispatch.
  // This function maps each effect to its primary action.

  switch (effect) {
    case 'die':
      return { type: 'DIE', targets };
    case 'revive':
      return { type: 'REVIVE', targets };
    case 'haste':
      return { type: 'HASTE', targets };
    case 'slow':
      return { type: 'SLOW', targets };
    case 'enlarge':
      return { type: 'ENLARGE', targets };
    case 'reduce':
      return { type: 'REDUCE', targets };
    case 'fly':
      return { type: 'FLY', targets };
    case 'hold':
      return { type: 'HOLD', targets };
    case 'petrify':
      return { type: 'PETRIFY', targets };
    case 'invisibility':
      return { type: 'INVISIBILITY', targets };
    case 'earthbind':
      return { type: 'EARTHBIND', targets: [] };
    case 'massacre': {
      const victims = lobbyPlayers
        .filter(p => p.id !== casterPlayerId)
        .map(p => p.id);
      return { type: 'MASSACRE', caster: casterPlayerId, victims };
    }
    case 'massrevive':
      return { type: 'MASSREVIVE' };
    case 'dragon': {
      // Dragon victim selection is done outside the reducer (random + setTimeout)
      // so we return a noop-like placeholder that the caller will skip for dragon.
      // Actual dragon dispatch is handled separately in applySpellEffects.
      return { type: 'MASSREVIVE' }; // placeholder — caller handles dragon specially
    }
    case 'chaos':
      return { type: 'CHAOS' };
    case 'dispel':
      return { type: 'DISPEL', targets };
    default:
      // Noop for visual-only effects (fire, ice, heal, sparkle, etc.) — no buff state change.
      // BREAK_INVISIBILITY for invisible casters is handled as a trailing dispatch in applySpellEffects.
      return { type: 'MASSREVIVE' };
  }
}

// ─── applySpellEffects ───────────────────────────────────────────────────────

/**
 * Run the forEach dispatch loop for all detected spell effects.
 *
 * isLocalCast=true  → local player cast; setFlyHeight(0) called on earthbind/dispel-self
 * isLocalCast=false → remote (socket) cast; setFlyHeight(0) is NOT called
 *
 * Side effects that cannot be in the reducer (timeouts, random victim selection)
 * are handled here alongside dispatch calls.
 *
 * setMagicEffects / setEmotes are kept here (not in reducer) because they are
 * transient UI state — not spell-target state — and the 2.5s auto-remove
 * setTimeout must be co-located with the trigger.
 */
export function applySpellEffects(
  detectedEffects: MagicEffectType[],
  message: string,
  casterPlayerId: string,
  lobbyPlayers: Player[],
  flyingPlayersRef: Set<string>,         // current flyingPlayers at call-time
  invisiblePlayersRef: Set<string>,      // current invisiblePlayers at call-time
  isLocalCast: boolean,
  dispatch: (action: BuffAction) => void,
  setFlyHeight: (v: number) => void,
  setMagicEffects: (updater: (prev: Record<string, { effects: MagicEffectType[]; x: number; timestamp: number }>) => Record<string, { effects: MagicEffectType[]; x: number; timestamp: number }>) => void,
  setEmotes: (updater: (prev: Record<string, { message: string; timestamp: number; x: number; y: number }>) => Record<string, { message: string; timestamp: number; x: number; y: number }>) => void,
): void {
  detectedEffects.forEach(effect => {
    const targets = resolveTargets(effect, message, casterPlayerId, lobbyPlayers);

    // Dragon is handled separately (random victim + setTimeout) — dispatch deferred
    // to caller; applySpellEffects does not dispatch dragon directly.

    if (effect === 'dragon') {
      // Dragon is fully handled by the caller (handleLobbyEmote / handleEmoteSubmit)
      // because it requires random victim selection + external setTimeout.
      // We skip it here and let the caller continue handling the dragon block.
      return;
    }

    // For visual-only effects, skip dispatch (no buff state to change)
    const visualOnlyEffects: MagicEffectType[] = [
      'fire', 'ice', 'heal', 'lightning', 'magic', 'love',
      'confetti', 'rage', 'sleep', 'sparkle',
    ];
    if (visualOnlyEffects.includes(effect)) {
      return; // No buff dispatch needed for pure visual effects
    }

    const action = buildAction(effect, targets, casterPlayerId, isLocalCast, invisiblePlayersRef, lobbyPlayers);
    dispatch(action);

    // isLocalCast divergence: local earthbind/dispel resets self fly height.
    // Remote path (isLocalCast=false) does NOT call setFlyHeight.
    if (isLocalCast && (effect === 'earthbind' || effect === 'dispel')) {
      // earthbind: reset if caster is flying
      if (effect === 'earthbind' && flyingPlayersRef.has(casterPlayerId)) {
        setFlyHeight(0);
      }
      // dispel: reset fly height if dispelling self and caster is flying
      if (effect === 'dispel' && targets.includes(casterPlayerId) && flyingPlayersRef.has(casterPlayerId)) {
        setFlyHeight(0);
      }
    }
  });

  // Break invisibility: if caster is invisible and cast a non-invisibility spell,
  // dispatch BREAK_INVISIBILITY as a trailing action (same as original cascade logic).
  if (!detectedEffects.includes('invisibility') && invisiblePlayersRef.has(casterPlayerId)) {
    dispatch({ type: 'BREAK_INVISIBILITY', playerId: casterPlayerId });
  }
}
