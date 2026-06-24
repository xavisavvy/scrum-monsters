/**
 * useLobbyMovement — MAINT-13 seam 5 (LAST extraction of phase 52).
 *
 * Pure side-effect hook. No return value.
 *
 * Wraps:
 *   - The 16ms movement useEffect (interval, position, afterimage, screen-shake)
 *   - The jump animation useEffect (rAF-based parabolic arc, jump afterimage)
 *
 * The collapsed dep array from MAINT-11 travels into this hook:
 *   movement effect: [keys, gamePhase, emit, currentPlayerId]
 *   refs are passed as stable props — NOT deps.
 *
 * DEBUNKED seams (leave as-is in two separate effects):
 *   - Movement-tick afterimage (reads jumpHeightRef.current) — movement useEffect
 *   - Jump-arc afterimage (reads rAF-local `height`) — jump useEffect
 */

import React, { useEffect } from 'react';
import type { SpriteDirection } from '@/hooks/useSpriteAnimation';
import type { MagicEffectType } from '@/lib/utils/magicWords';

// ─── Props interface ────────────────────────────────────────────────────────

export interface UseLobbyMovementProps {
  // Movement trigger & phase gate
  keys: Set<string>;
  gamePhase: string | undefined;
  // Stable hook reference from useWebSocket
  emit: (event: string, data?: unknown) => void;
  // Current player for buff/freeze/id checks
  currentPlayerId: string | undefined;
  // Movement geometry
  characterSize: number;
  moveSpeed: number;
  movementAreaRef: React.MutableRefObject<HTMLDivElement | null>;
  // Buff refs (MAINT-11 — stable, not deps)
  jumpHeightRef: React.MutableRefObject<number>;
  frozenPlayersRef: React.MutableRefObject<Set<string>>;
  petrifiedPlayersRef: React.MutableRefObject<Set<string>>;
  flyingPlayersRef: React.MutableRefObject<Set<string>>;
  speedBuffsRef: React.MutableRefObject<Record<string, { type: 'haste' | 'slow'; stacks: number }>>;
  sizeBuffsRef: React.MutableRefObject<Record<string, { type: 'enlarge' | 'reduce'; stacks: number }>>;
  deadPlayersRef: React.MutableRefObject<Set<string>>;
  // Setters consumed by movement + jump effects
  setMyPosition: React.Dispatch<React.SetStateAction<{ x: number; direction: SpriteDirection }>>;
  setFlyHeight: React.Dispatch<React.SetStateAction<number>>;
  setAfterimages: React.Dispatch<React.SetStateAction<Array<{
    id: string;
    playerId: string;
    x: number;
    y: number;
    timestamp: number;
    type: 'haste' | 'slow';
  }>>>;
  setScreenShake: React.Dispatch<React.SetStateAction<number>>;
  // Jump state — isJumping drives the jump animation effect dep; jumpHeight is a ref
  jumpState: { isJumping: boolean; jumpHeight: number };
  setJumpState: React.Dispatch<React.SetStateAction<{ isJumping: boolean; jumpHeight: number }>>;
  // Speed buffs + myPosition for jump-arc afterimage (dep values — not refs)
  speedBuffs: Record<string, { type: 'haste' | 'slow'; stacks: number }>;
  myPositionX: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLobbyMovement({
  keys,
  gamePhase,
  emit,
  currentPlayerId,
  characterSize,
  moveSpeed,
  movementAreaRef,
  jumpHeightRef,
  frozenPlayersRef,
  petrifiedPlayersRef,
  flyingPlayersRef,
  speedBuffsRef,
  sizeBuffsRef,
  deadPlayersRef,
  setMyPosition,
  setFlyHeight,
  setAfterimages,
  setScreenShake,
  jumpState,
  setJumpState,
  speedBuffs,
  myPositionX,
}: UseLobbyMovementProps): void {

  // ── 1. 16ms movement interval ────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'lobby' || keys.size === 0) {
      return;
    }

    const movePlayer = () => {
      // Check if player is frozen or petrified - no movement allowed
      // MAINT-11: Read from refs (not state) to avoid stale closure without dep-array churn
      const playerId = currentPlayerId;
      if (playerId && (frozenPlayersRef.current.has(playerId) || petrifiedPlayersRef.current.has(playerId))) {
        return; // Can't move while frozen or petrified
      }

      setMyPosition(prev => {
        let newX = prev.x;
        let direction: SpriteDirection = prev.direction;
        let moving = false;

        // Get movement area width with proper fallback and safety checks
        const movementArea = movementAreaRef.current;
        if (!movementArea) return prev; // Don't move if area not available yet

        const movementAreaWidth = movementArea.clientWidth;
        if (movementAreaWidth <= characterSize) return prev; // Safety check

        const maxX = movementAreaWidth - characterSize;

        // Calculate speed multiplier based on buffs
        // MAINT-11: Read from refs to avoid dep-array churn on each buff Set mutation
        const isDead = playerId ? deadPlayersRef.current.has(playerId) : false;
        const speedBuff = playerId ? speedBuffsRef.current[playerId] : undefined;

        let speedMultiplier = 1;
        if (isDead) {
          speedMultiplier = 0.25; // Dead = 1/4 speed
        } else if (speedBuff?.type === 'haste') {
          // Haste stacks: 1 = 1.5x, 2 = 2x, 3 = 2.5x
          speedMultiplier = 1 + (speedBuff.stacks * 0.5);
        } else if (speedBuff?.type === 'slow') {
          speedMultiplier = 0.5; // Slow = 1/2 speed
        }

        const effectiveSpeed = moveSpeed * speedMultiplier;

        // Use percent-based movement for consistency across screen sizes
        const movePercentage = (effectiveSpeed / maxX) * 100;
        const currentPercent = (prev.x / maxX) * 100;

        // Horizontal movement (left/right)
        if (keys.has('ArrowLeft') || keys.has('KeyA')) {
          const newPercent = Math.max(0, currentPercent - movePercentage);
          newX = (newPercent / 100) * maxX;
          direction = 'left';
          moving = true;
        }
        if (keys.has('ArrowRight') || keys.has('KeyD')) {
          const newPercent = Math.min(100, currentPercent + movePercentage);
          newX = (newPercent / 100) * maxX;
          direction = 'right';
          moving = true;
        }

        // Vertical movement (only when flying)
        // MAINT-11: Read from flyingPlayersRef (already a ref) to avoid dep churn
        const isFlying = playerId ? flyingPlayersRef.current.has(playerId) : false;
        if (isFlying) {
          const maxFlyHeight = 150; // Max height in pixels
          if (keys.has('ArrowUp') || keys.has('KeyW')) {
            setFlyHeight(prev => Math.min(prev + effectiveSpeed * 2, maxFlyHeight));
            moving = true;
          }
          if (keys.has('ArrowDown') || keys.has('KeyS')) {
            setFlyHeight(prev => Math.max(prev - effectiveSpeed * 2, 0));
            moving = true;
          }
        }

        // Emit position to server for other players to see
        if (moving) {
          const percentX = (newX / maxX) * 100;
          emit('lobby_player_pos', { x: percentX, y: 85, direction });

          // Generate afterimages for haste/slow effects
          // MAINT-11: jumpHeightRef.current replaces jumpState.jumpHeight (L564 per plan)
          //   jumpState.jumpHeight changed ~60x per jump via rAF — reading the ref here
          //   avoids dep-array churn without any behavior change in afterimage y-position.
          //   Note: the jump-arc afterimage in the jump effect below (DEBUNKED seam) uses
          //   a rAF-local `height` variable and is intentionally kept separate.
          if (speedBuff && playerId) {
            const currentJumpHeight = jumpHeightRef.current;
            setAfterimages(prevImages => [
              ...prevImages.slice(-10), // Keep only last 10 afterimages
              {
                id: `${playerId}-${Date.now()}`,
                playerId,
                x: prev.x,
                y: currentJumpHeight,
                timestamp: Date.now(),
                type: speedBuff.type
              }
            ]);
          }

          // Trigger screen shake for enlarged players
          // MAINT-11: Read from sizeBuffsRef to avoid dep churn on size buff Set mutation
          const sizeBuff = playerId ? sizeBuffsRef.current[playerId] : undefined;
          if (sizeBuff?.type === 'enlarge') {
            setScreenShake(sizeBuff.stacks);
            // Reset shake after short duration
            setTimeout(() => setScreenShake(0), 100);
          }
        }

        return { x: newX, direction };
      });
    };

    const interval = setInterval(movePlayer, 16); // ~60 FPS for smooth movement
    return () => clearInterval(interval);
  // MAINT-11: Collapsed dep array — buff Sets and jumpHeight promoted to refs above.
  // keys: guards movement logic (keys.size === 0 is the early return; keys.has(...) used in body)
  // gamePhase: early-return guard (gamePhase !== 'lobby')
  // emit: stable from useWebSocket; included per exhaustive-deps rules
  // currentPlayerId: used in freeze/dead/speed/size checks inside movePlayer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, gamePhase, emit, currentPlayerId]);

  // ── 2. Jump animation (rAF-based parabolic arc) ──────────────────────────
  //
  // DEBUNKED seam: this effect has its own setAfterimages call (jump-arc afterimage)
  // that reads the rAF-local `height` variable. The movement-tick afterimage above
  // reads jumpHeightRef.current. These are TWO DISTINCT triggers — do NOT merge.

  useEffect(() => {
    if (!jumpState.isJumping) return;

    const jumpDuration = 600; // 600ms total jump time
    const maxHeight = 50; // 50px max jump height
    const startTime = Date.now();
    let lastAfterimageTime = 0;

    const animateJump = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / jumpDuration, 1);

      // Sine wave for smooth up/down motion
      const height = Math.sin(progress * Math.PI) * maxHeight;

      setJumpState(prev => ({
        ...prev,
        jumpHeight: height
      }));

      // Generate afterimages during jump if player has speed buff
      const playerId = currentPlayerId;
      const speedBuff = playerId ? speedBuffs[playerId] : undefined;
      if (speedBuff && playerId && elapsed - lastAfterimageTime > 50) {
        lastAfterimageTime = elapsed;
        setAfterimages(prevImages => [
          ...prevImages.slice(-10),
          {
            id: `${playerId}-jump-${Date.now()}`,
            playerId,
            x: myPositionX,
            y: height, // Capture current jump height (rAF-local — DEBUNKED seam)
            timestamp: Date.now(),
            type: speedBuff.type
          }
        ]);
      }

      if (progress < 1) {
        requestAnimationFrame(animateJump);
      } else {
        // Jump complete
        setJumpState({
          isJumping: false,
          jumpHeight: 0
        });
        // Emit landing event to other players
        emit('lobby_player_jump', { isJumping: false });
      }
    };

    requestAnimationFrame(animateJump);
  }, [jumpState.isJumping, emit, currentPlayerId, speedBuffs, myPositionX]);
}
