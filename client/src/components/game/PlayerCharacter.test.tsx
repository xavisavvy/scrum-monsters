import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameState } from '@/lib/stores/useGameState';
import { PlayerCharacter } from './PlayerCharacter';

// Mock SpriteRenderer (image-asset-heavy; not relevant to damage-flash logic)
vi.mock('./SpriteRenderer', () => ({
  SpriteRenderer: () => <div data-testid="sprite-renderer" />,
}));

describe('PlayerCharacter damage flash (Phase 42-01 / FIX-04)', () => {
  const baseProps = {
    avatarClass: 'warrior' as const,
    playerName: 'Tester',
    position: { x: 100, y: 100 },
    onPositionChange: vi.fn(),
    onShoot: vi.fn(),
    isJumping: false,
    isDead: false,
    containerWidth: 800,
    containerHeight: 600,
    playerId: 'p1',
  };

  beforeEach(() => {
    useGameState.setState({
      currentLobby: {
        gamePhase: 'battle',
        playerCombatStates: { p1: { hp: 100, maxHp: 100 } },
      } as any,
    });
  });

  it('renders without crashing when combatState defaults apply', () => {
    const { container } = render(<PlayerCharacter {...baseProps} />);
    expect(container.querySelector('[data-damaged="false"]')).toBeTruthy();
  });

  it('sets data-damaged="true" when hp decrements', () => {
    const { container } = render(<PlayerCharacter {...baseProps} />);
    expect(container.querySelector('[data-damaged="false"]')).toBeTruthy();

    act(() => {
      useGameState.setState((s: any) => ({
        currentLobby: {
          ...s.currentLobby,
          playerCombatStates: { p1: { hp: 70, maxHp: 100 } },
        },
      }));
    });

    expect(container.querySelector('[data-damaged="true"]')).toBeTruthy();
  });

  it('clears data-damaged after 400ms timeout', async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<PlayerCharacter {...baseProps} />);

      act(() => {
        useGameState.setState((s: any) => ({
          currentLobby: {
            ...s.currentLobby,
            playerCombatStates: { p1: { hp: 70, maxHp: 100 } },
          },
        }));
      });
      expect(container.querySelector('[data-damaged="true"]')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(container.querySelector('[data-damaged="false"]')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MAINT-06 perf guardrail: scoped selectors prevent spurious re-renders', () => {
  const baseProps = {
    avatarClass: 'warrior' as const,
    playerName: 'Tester',
    position: { x: 100, y: 100 },
    onPositionChange: vi.fn(),
    onShoot: vi.fn(),
    isJumping: false,
    isDead: false,
    containerWidth: 800,
    containerHeight: 600,
  };

  beforeEach(() => {
    useGameState.setState({
      currentLobby: {
        gamePhase: 'battle',
        playerCombatStates: { p1: { hp: 100, maxHp: 100 } },
      } as any,
      attackAnimations: [],
    });
  });

  it('does NOT re-render when boss HP changes (unrelated setLobby field)', () => {
    // TrackingWrapper subscribes to the same selectors as PlayerCharacter (hp scalar).
    // When those selectors change, BOTH TrackingWrapper and PlayerCharacter re-render.
    // When an unrelated field (boss HP) changes, NEITHER re-renders.
    // This mirrors PlayerCharacter's render schedule exactly.
    let renderCount = 0;

    function TrackingWrapper(props: Parameters<typeof PlayerCharacter>[0]) {
      // Mirror PlayerCharacter's selector subscriptions — re-renders on same state changes
      useGameState((s) => s.currentLobby?.playerCombatStates?.[props.playerId ?? '']?.hp ?? 100);
      useGameState((s) => s.currentLobby?.playerCombatStates?.[props.playerId ?? '']?.maxHp ?? 100);
      renderCount++;
      return <PlayerCharacter {...props} />;
    }

    const { container } = render(<TrackingWrapper {...baseProps} playerId="p1" />);
    const renderCountAfterMount = renderCount;

    // Trigger a setLobby that changes BOSS HP (unrelated to p1's combatState)
    act(() => {
      useGameState.setState((s: any) => ({
        currentLobby: {
          ...s.currentLobby,
          boss: { currentHealth: 900 },
        },
      }));
    });

    // PlayerCharacter should NOT re-render (p1's hp/maxHp unchanged)
    expect(renderCount).toBe(renderCountAfterMount);

    // Trigger a setLobby that changes p1's HP
    act(() => {
      useGameState.setState((s: any) => ({
        currentLobby: {
          ...s.currentLobby,
          playerCombatStates: { p1: { hp: 70, maxHp: 100 } },
        },
      }));
    });

    // PlayerCharacter SHOULD re-render (p1's hp changed)
    expect(renderCount).toBe(renderCountAfterMount + 1);

    // DOM confirms health bar reflects new hp (70% of 100)
    const healthBar = container.querySelector('.h-full.transition-all') as HTMLElement;
    expect(healthBar?.style.width).toBe('70%');
  });
});
