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
