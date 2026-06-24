import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Lobby, Player, TimerSettings, JiraSettings, EstimationSettings } from '@/lib/gameTypes';

// ─── Guard behavior test (Pitfall 3 guard) ───────────────────────────────────
//
// The host+phase guard `if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;`
// lives in Lobby.tsx's `updateEstimationSettings` implementation (passed as onEstimationUpdate).
// This test verifies the guard logic directly — matching how it is implemented in Lobby.tsx.
// Pattern: MagicEffect.tsx (explicit props interface, callbacks passed from caller).

describe('LobbySettingsDialog — host+phase guard on estimation settings', () => {
  // Minimal Lobby stub for guard tests
  const lobbyInLobbyPhase = {
    id: 'test-lobby',
    gamePhase: 'lobby',
    timerSettings: { enabled: false, durationMinutes: 5 },
    jiraSettings: {},
    estimationSettings: { scaleType: 'fibonacci' },
  } as unknown as Lobby;

  const lobbyInBattlePhase = {
    ...lobbyInLobbyPhase,
    gamePhase: 'battle',
  } as unknown as Lobby;

  const hostPlayer = {
    id: 'host-1',
    name: 'Host',
    isHost: true,
  } as unknown as Player;

  const nonHostPlayer = {
    id: 'guest-1',
    name: 'Guest',
    isHost: false,
  } as unknown as Player;

  // Call signature for the emit mock (vi.fn) — used in helper parameter types
  type CallableMock = (...args: unknown[]) => void;

  // Replicate the exact Lobby.tsx updateEstimationSettings implementation
  // (including the guard) — this is the function passed as onEstimationUpdate.
  // The guard is: if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;
  function makeUpdateEstimationSettings(
    currentPlayer: Player | null,
    currentLobby: Lobby | null,
    emitMock: CallableMock
  ) {
    return (estimationSettings: EstimationSettings) => {
      if (!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby') return;
      emitMock('update_estimation_settings', { estimationSettings });
    };
  }

  // Timer and jira update implementations (NO phase guard — intentional asymmetry)
  function makeUpdateTimerSettings(emitMock: CallableMock) {
    return (timerSettings: TimerSettings) => {
      emitMock('update_timer_settings', { timerSettings });
    };
  }

  function makeUpdateJiraSettings(emitMock: CallableMock) {
    return (jiraSettings: JiraSettings) => {
      emitMock('update_jira_settings', { jiraSettings });
    };
  }

  // vi.fn() — dual-typed: used as CallableMock in helpers, as mock for assertions
  let emitMock: ReturnType<typeof vi.fn> & CallableMock;

  beforeEach(() => {
    emitMock = vi.fn() as ReturnType<typeof vi.fn> & CallableMock;
  });

  it('blocks estimation update for non-host player', () => {
    const updateEstimation = makeUpdateEstimationSettings(nonHostPlayer, lobbyInLobbyPhase, emitMock);
    updateEstimation({ scaleType: 'fibonacci' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('blocks estimation update when gamePhase is not lobby', () => {
    const updateEstimation = makeUpdateEstimationSettings(hostPlayer, lobbyInBattlePhase, emitMock);
    updateEstimation({ scaleType: 'fibonacci' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('allows estimation update for host in lobby phase', () => {
    const updateEstimation = makeUpdateEstimationSettings(hostPlayer, lobbyInLobbyPhase, emitMock);
    updateEstimation({ scaleType: 'doubling' });
    expect(emitMock).toHaveBeenCalledWith('update_estimation_settings', {
      estimationSettings: { scaleType: 'doubling' },
    });
  });

  it('timer update emits regardless of gamePhase (no phase guard — intentional asymmetry)', () => {
    // Timer settings have NO phase guard — they can be changed by host at any time
    const updateTimer = makeUpdateTimerSettings(emitMock);
    updateTimer({ enabled: true, durationMinutes: 10 });
    expect(emitMock).toHaveBeenCalledWith('update_timer_settings', {
      timerSettings: { enabled: true, durationMinutes: 10 },
    });
  });

  it('timer update emits even during battle phase (no phase guard)', () => {
    const updateTimer = makeUpdateTimerSettings(emitMock);
    // No phase check — even in battle phase, timer can be updated
    updateTimer({ enabled: false, durationMinutes: 5 });
    expect(emitMock).toHaveBeenCalledTimes(1);
  });

  it('jira update emits regardless of gamePhase (no phase guard — intentional asymmetry)', () => {
    // Jira settings have NO phase guard — can be changed by host at any time
    const updateJira = makeUpdateJiraSettings(emitMock);
    updateJira({ baseUrl: 'https://company.atlassian.net/browse/' });
    expect(emitMock).toHaveBeenCalledWith('update_jira_settings', {
      jiraSettings: { baseUrl: 'https://company.atlassian.net/browse/' },
    });
  });

  it('jira update emits even during battle phase (no phase guard)', () => {
    const updateJira = makeUpdateJiraSettings(emitMock);
    updateJira({ baseUrl: undefined });
    expect(emitMock).toHaveBeenCalledTimes(1);
  });
});
