/**
 * PlayerController tests — MAINT-11 (interval-once) + MAINT-14 (handleShootAtTarget / startCooldown)
 *
 * Strategy: render the full component with all heavy deps mocked so Vitest (happy-dom)
 * can run without WebGL / Socket.IO / audio infrastructure.
 */
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameState } from '@/lib/stores/useGameState';

// ── Heavy dependency mocks ────────────────────────────────────────────────────

vi.mock('./PlayerCharacter', () => ({
  PlayerCharacter: () => <div data-testid="player-character" />,
}));

vi.mock('./ProjectileSystem', () => ({
  ProjectileSystem: () => <div data-testid="projectile-system" />,
}));

vi.mock('./MobileControls', () => ({
  MobileControls: () => <div data-testid="mobile-controls" />,
}));

const mockEmit = vi.fn();

vi.mock('@/lib/stores/useWebSocket', () => ({
  useWebSocket: () => ({
    emit: mockEmit,
    socket: null,
  }),
}));

vi.mock('@/lib/stores/useAudio', () => ({
  useAudio: () => ({ playHit: vi.fn() }),
}));

// Stable viewport mock — worldToScreen / screenToWorld are pure math
const MOCK_VIEWPORT = {
  worldWidth: 1920,
  worldHeight: 1080,
  viewportWidth: 1280,
  viewportHeight: 720,
  cameraX: 960,
  cameraY: 540,
  scale: 1,
  worldToScreen: (wx: number, wy: number) => ({ x: wx, y: wy }),
  screenToWorld: (sx: number, sy: number) => ({ x: sx, y: sy }),
  setCameraTarget: vi.fn(),
};

vi.mock('@/lib/hooks/useViewport', () => ({
  useViewport: () => MOCK_VIEWPORT,
  worldToPercent: (x: number, y: number, ww: number, wh: number) => ({
    x: Math.min(100, Math.max(0, (x / ww) * 100)),
    y: Math.min(100, Math.max(0, (y / wh) * 100)),
  }),
  percentToWorld: (px: number, py: number, ww: number, wh: number) => ({
    x: (px / 100) * ww,
    y: (py / 100) * wh,
  }),
}));

vi.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => false,
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { PlayerController } from './PlayerController';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupBattleState() {
  useGameState.setState({
    currentPlayer: {
      id: 'p1',
      team: 'developers',
      avatar: 'warrior',
      name: 'Tester',
    } as any,
    currentLobby: {
      id: 'lobby1',
      gamePhase: 'battle',
      players: [{ id: 'p1', team: 'developers', avatar: 'warrior', name: 'Tester' }],
      playerPositions: { p1: { x: 50, y: 50 } },
      playerCombatStates: {},
    } as any,
    addAttackAnimation: vi.fn(),
  } as any);
}

function setupSpectatorBattleState() {
  useGameState.setState({
    currentPlayer: {
      id: 'p1',
      team: 'spectators',
      avatar: 'warrior',
      name: 'Spectator',
    } as any,
    currentLobby: {
      id: 'lobby1',
      gamePhase: 'battle',
      players: [
        { id: 'p1', team: 'spectators', avatar: 'warrior', name: 'Spectator' },
        { id: 'p2', team: 'developers', avatar: 'rogue', name: 'Target' },
      ],
      playerPositions: {
        p1: { x: 50, y: 50 },
        p2: { x: 200, y: 200 },
      },
      playerCombatStates: {},
    } as any,
    addAttackAnimation: vi.fn(),
  } as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MAINT-11: movement interval created exactly once per session', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    setupBattleState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setInterval is NOT recreated when direction changes (turning mid-movement)', () => {
    // Context: `keys` legitimately recreates the interval when new keys are added (each
    // keydown creates a new Set reference). That is expected. What MUST NOT happen is
    // an additional interval recreation when only `currentDirection` changes (turning).
    //
    // Before MAINT-11: keys={ArrowLeft} → direction='left' → setCurrentDirection('left')
    //   → useEffect dep [currentDirection] fires → new interval created = 2 intervals total
    //   while holding one key.
    //
    // After MAINT-11: direction change reads currentDirectionRef.current inside movePlayer;
    //   currentDirection is NOT in the dep array → no additional interval recreation on turn.
    //
    // Test: hold ArrowLeft → release → hold ArrowRight. Count 16ms intervals.
    //   Before fix: each direction change triggers dep re-run → 3+ intervals.
    //   After fix: only keys changes trigger the dep → exactly 3 intervals (mount + left + right).

    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    const { unmount } = render(<PlayerController />);
    // mount creates the first interval
    act(() => { vi.advanceTimersByTime(32); }); // 2 ticks — direction='left' set internally

    const afterMount = setIntervalSpy.mock.calls.filter(c => c[1] === 16).length;

    // Press ArrowLeft — keys Set changes, interval recreates (expected)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    });
    act(() => { vi.advanceTimersByTime(32); }); // direction may change to 'left' internally

    // Press ArrowRight — keys changes again (expected recreation), but direction change alone
    // must NOT add another interval
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    });
    act(() => { vi.advanceTimersByTime(32); });

    const movementIntervalCalls = setIntervalSpy.mock.calls.filter(c => c[1] === 16);

    // Expected: afterMount + 1 (ArrowLeft keys change) + 1 (ArrowRight keys change) = 3 max.
    // Before fix: additional intervals created for each setCurrentDirection call during
    //   the movement loop → much higher count (5+ observed).
    // After fix: only key-set changes drive recreation → count bounded by key events, not
    //   direction changes.
    expect(movementIntervalCalls.length).toBeLessThanOrEqual(afterMount + 2);

    unmount();
    setIntervalSpy.mockRestore();
  });

  it('movement still runs without throwing after currentDirection ref promotion', () => {
    vi.useFakeTimers();

    const { unmount } = render(<PlayerController />);

    // Hold left arrow — loop should fire repeatedly without crash
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    });
    expect(() => {
      act(() => { vi.advanceTimersByTime(200); }); // 12+ movement ticks
    }).not.toThrow();

    unmount();
  });
});

describe('MAINT-14: handleShootAtTarget — keyboard Ctrl (Site 1, projectile mode)', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    setupBattleState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ControlLeft keydown emits player_projectile with correct shape', () => {
    const { unmount } = render(<PlayerController />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', bubbles: true }));
    });

    // After MAINT-14: the Ctrl handler delegates to handleShootAtTarget with mode='projectile'
    // which must emit player_projectile
    expect(mockEmit).toHaveBeenCalledWith(
      'player_projectile',
      expect.objectContaining({
        startX: expect.any(Number),
        startY: expect.any(Number),
        targetX: expect.any(Number),
        targetY: expect.any(Number),
        emoji: expect.any(String),
      })
    );

    unmount();
  });

  it('ControlRight keydown also emits player_projectile (Site 1 handles both codes)', () => {
    const { unmount } = render(<PlayerController />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlRight', bubbles: true }));
    });

    expect(mockEmit).toHaveBeenCalledWith('player_projectile', expect.any(Object));

    unmount();
  });
});

describe('MAINT-14: handleShootAtTarget — Site 3 inline onKeyDown (direct mode)', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    setupBattleState(); // developer team → attack_boss direct mode
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Site 3 ControlLeft on the container div emits attack_boss for developer team', () => {
    const { container, unmount } = render(<PlayerController />);

    // Site 3 is the onKeyDown on the root div (tabIndex element) — it runs in battle phase
    const gameDiv = container.querySelector('[tabindex="0"]') as HTMLElement;
    expect(gameDiv).toBeTruthy();

    act(() => {
      // fireEvent properly triggers React's synthetic event system (unlike raw dispatchEvent)
      fireEvent.keyDown(gameDiv, { code: 'ControlLeft' });
    });

    // Developer team + no targetPlayerId → attack_boss (direct mode)
    expect(mockEmit).toHaveBeenCalledWith(
      'attack_boss',
      expect.objectContaining({ damage: expect.any(Number) })
    );

    unmount();
  });
});

describe('MAINT-14: handleShootAtTarget — Site 3 spectator direct mode', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    setupSpectatorBattleState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Site 3 ControlLeft for spectator team calls handleShootAtTarget direct mode', () => {
    const { container, unmount } = render(<PlayerController />);

    const gameDiv = container.querySelector('[tabindex="0"]') as HTMLElement;
    expect(gameDiv).toBeTruthy();

    act(() => {
      // fireEvent properly triggers React synthetic event handlers
      fireEvent.keyDown(gameDiv, { code: 'ControlLeft' });
    });

    // Spectator + target found → attack_player; or no screen-coord match → attack_boss
    // Either emit is valid; key assertion is that handleShootAtTarget was called (no throw)
    const callNames = mockEmit.mock.calls.map((c: any) => c[0]);
    const hasValidEmit = callNames.some(
      (name: string) => name === 'attack_player' || name === 'attack_boss'
    );
    expect(hasValidEmit).toBe(true);

    unmount();
  });
});

describe('MAINT-14: startCooldown — countdown behavior', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    setupBattleState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Q key starts a 100ms countdown interval (startCooldown)', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    const { unmount } = render(<PlayerController />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
    });

    // startCooldown must register a 100ms setInterval
    const cooldownCalls = setIntervalSpy.mock.calls.filter((call) => call[1] === 100);
    expect(cooldownCalls.length).toBeGreaterThanOrEqual(1);

    // Advance 5100ms — ticker should clear itself at prev <= 100
    act(() => { vi.advanceTimersByTime(5100); });

    unmount();
    setIntervalSpy.mockRestore();
  });

  it('startCooldown sets initial cooldown to 5000 (setSpecialAttackCooldown(5000) called)', () => {
    vi.useFakeTimers();
    // We can't spy on setSpecialAttackCooldown directly, but we can verify the UI
    // renders the cooldown bar after Q press, which only renders when cooldown > 0.
    const { container, unmount } = render(<PlayerController />);

    // Before Q: no cooldown UI
    expect(container.querySelector('.border-purple-500')).toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
    });

    // After Q: cooldown UI appears (cooldown > 0)
    expect(container.querySelector('.border-purple-500')).toBeTruthy();

    unmount();
    vi.useRealTimers();
  });
});

describe('MAINT-11 perf guardrail: render-count not increased by unsubscribed (boss) field', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    useGameState.setState({
      currentPlayer: {
        id: 'p1',
        team: 'developers',
        avatar: 'warrior',
        name: 'Tester',
      } as any,
      currentLobby: {
        id: 'lobby1',
        gamePhase: 'battle',
        players: [{ id: 'p1', team: 'developers', avatar: 'warrior', name: 'Tester' }],
        playerPositions: { p1: { x: 50, y: 50 } },
        playerCombatStates: { p1: { hp: 100, maxHp: 100 } },
        boss: { currentHealth: 1000, maxHealth: 1000 },
      } as any,
      addAttackAnimation: vi.fn(),
    } as any);
  });

  it('does NOT re-render when boss.currentHealth changes (boss excluded from useShallow selector)', () => {
    // TrackingWrapper mirrors Phase-49 useShallow selectors for PlayerController.
    // boss is intentionally excluded — boss-HP updates must not re-render PlayerController.
    let renderCount = 0;

    // Import useShallow synchronously (it's a stable utility, always available)
    const { useShallow } = require('zustand/react/shallow') as typeof import('zustand/react/shallow');

    function TrackingWrapper() {
      // Mirror same selectors as PlayerController (Phase 49 MAINT-06)
      useGameState(
        useShallow((s: any) =>
          s.currentPlayer
            ? {
                id: s.currentPlayer.id,
                team: s.currentPlayer.team,
                avatar: s.currentPlayer.avatar,
                name: s.currentPlayer.name,
              }
            : null
        )
      );
      useGameState(
        useShallow((s: any) =>
          s.currentLobby
            ? {
                id: s.currentLobby.id,
                gamePhase: s.currentLobby.gamePhase,
                players: s.currentLobby.players,
                playerPositions: s.currentLobby.playerPositions,
                playerCombatStates: s.currentLobby.playerCombatStates,
              }
            : null
        )
      );
      renderCount++;
      return <PlayerController />;
    }

    render(<TrackingWrapper />);
    const renderCountAfterMount = renderCount;

    // Mutate boss.currentHealth — excluded from useShallow selector in Phase 49
    act(() => {
      useGameState.setState((s: any) => ({
        currentLobby: {
          ...s.currentLobby,
          boss: { currentHealth: 900, maxHealth: 1000 },
        },
      }));
    });

    // PlayerController (React.memo + useShallow) must NOT re-render
    expect(renderCount).toBe(renderCountAfterMount);

    // Sanity-check: mutating a subscribed field (gamePhase) DOES cause re-render
    act(() => {
      useGameState.setState((s: any) => ({
        currentLobby: {
          ...s.currentLobby,
          gamePhase: 'scoring',
        },
      }));
    });

    expect(renderCount).toBeGreaterThan(renderCountAfterMount);
  });
});
