import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './EventBus';
import { ScopedEventBus } from './ScopedEventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('emit and on', () => {
    it('should emit events to registered listeners', () => {
      const listener = vi.fn();
      eventBus.on('estimation:vote_cast', listener);

      eventBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        vote: 5,
        team: 'developers'
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        vote: 5,
        team: 'developers'
      });
    });

    it('should support multiple listeners for same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      eventBus.on('combat:boss_damaged', listener1);
      eventBus.on('combat:boss_damaged', listener2);

      eventBus.emit('combat:boss_damaged', {
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        damage: 10,
        bossHealth: 90
      });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should handle async listeners without blocking', async () => {
      const results: number[] = [];

      eventBus.on('session:player_joined', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(1);
      });

      eventBus.on('session:player_joined', () => {
        results.push(2);
      });

      eventBus.emit('session:player_joined', {
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        playerName: 'Test Player',
        team: 'developers',
      });

      // Sync listener should have run immediately
      expect(results).toContain(2);

      // Wait for async listener
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(results).toContain(1);
    });
  });

  describe('once', () => {
    it('should only fire listener once', () => {
      const listener = vi.fn();
      eventBus.once('session:phase_changed', listener);

      const payload = {
        lobbyId: 'lobby-1',
        oldPhase: 'lobby' as const,
        newPhase: 'battle' as const
      };

      eventBus.emit('session:phase_changed', payload);
      eventBus.emit('session:phase_changed', payload);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should remove listener', () => {
      const listener = vi.fn();
      eventBus.on('combat:player_downed', listener);
      eventBus.off('combat:player_downed', listener);

      eventBus.emit('combat:player_downed', {
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        countdownSeconds: 10
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getRegisteredEvents', () => {
    it('should return list of events with listeners', () => {
      eventBus.on('session:player_joined', () => {});
      eventBus.on('combat:boss_defeated', () => {});

      const events = eventBus.getRegisteredEvents();

      expect(events).toContain('session:player_joined');
      expect(events).toContain('combat:boss_defeated');
    });
  });
});

describe('ScopedEventBus', () => {
  let scopedBus: ScopedEventBus;

  beforeEach(() => {
    scopedBus = new ScopedEventBus();
  });

  describe('subscribeScoped', () => {
    it('should register listener and track by scope', () => {
      const listener = vi.fn();
      scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', listener);

      expect(scopedBus.getScopeListenerCount('lobby-1')).toBe(1);

      scopedBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby-1',
        playerId: 'player-1',
        vote: 5,
        team: 'developers'
      });

      expect(listener).toHaveBeenCalled();
    });

    it('should track multiple listeners per scope', () => {
      scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', () => {});
      scopedBus.subscribeScoped('lobby-1', 'combat:boss_damaged', () => {});
      scopedBus.subscribeScoped('lobby-1', 'session:phase_changed', () => {});

      expect(scopedBus.getScopeListenerCount('lobby-1')).toBe(3);
    });

    it('should track listeners separately per scope', () => {
      scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', () => {});
      scopedBus.subscribeScoped('lobby-2', 'estimation:vote_cast', () => {});

      expect(scopedBus.getScopeListenerCount('lobby-1')).toBe(1);
      expect(scopedBus.getScopeListenerCount('lobby-2')).toBe(1);
    });
  });

  describe('cleanupScope', () => {
    it('should remove all listeners for a scope', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', listener1);
      scopedBus.subscribeScoped('lobby-1', 'combat:boss_damaged', listener2);

      const removed = scopedBus.cleanupScope('lobby-1');

      expect(removed).toBe(2);
      expect(scopedBus.getScopeListenerCount('lobby-1')).toBe(0);

      // Verify listeners are actually removed
      scopedBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby-1',
        playerId: 'p1',
        vote: 5,
        team: 'developers'
      });
      expect(listener1).not.toHaveBeenCalled();
    });

    it('should not affect other scopes when cleaning up', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', listener1);
      scopedBus.subscribeScoped('lobby-2', 'estimation:vote_cast', listener2);

      scopedBus.cleanupScope('lobby-1');

      expect(scopedBus.getScopeListenerCount('lobby-1')).toBe(0);
      expect(scopedBus.getScopeListenerCount('lobby-2')).toBe(1);

      // Verify lobby-2 listener still works
      scopedBus.emit('estimation:vote_cast', {
        lobbyId: 'lobby-2',
        playerId: 'p1',
        vote: 5,
        team: 'developers'
      });
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle cleanup of non-existent scope gracefully', () => {
      const removed = scopedBus.cleanupScope('non-existent');
      expect(removed).toBe(0);
    });
  });

  describe('getActiveScopes', () => {
    it('should return all scopes with registered listeners', () => {
      scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', () => {});
      scopedBus.subscribeScoped('lobby-2', 'combat:boss_damaged', () => {});
      scopedBus.subscribeScoped('lobby-3', 'session:phase_changed', () => {});

      const scopes = scopedBus.getActiveScopes();

      expect(scopes).toHaveLength(3);
      expect(scopes).toContain('lobby-1');
      expect(scopes).toContain('lobby-2');
      expect(scopes).toContain('lobby-3');
    });
  });

  describe('getTotalScopedListenerCount', () => {
    it('should return total listeners across all scopes', () => {
      scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', () => {});
      scopedBus.subscribeScoped('lobby-1', 'combat:boss_damaged', () => {});
      scopedBus.subscribeScoped('lobby-2', 'session:phase_changed', () => {});

      expect(scopedBus.getTotalScopedListenerCount()).toBe(3);
    });
  });

  describe('memory leak prevention', () => {
    it('should allow complete listener cleanup simulating lobby destruction', () => {
      // Simulate creating a lobby with many listeners
      for (let i = 0; i < 100; i++) {
        scopedBus.subscribeScoped('lobby-1', 'estimation:vote_cast', () => {});
      }

      expect(scopedBus.getScopeListenerCount('lobby-1')).toBe(100);

      // Simulate destroying the lobby
      scopedBus.cleanupScope('lobby-1');

      expect(scopedBus.getScopeListenerCount('lobby-1')).toBe(0);
      expect(scopedBus.getActiveScopes()).not.toContain('lobby-1');
    });
  });
});
