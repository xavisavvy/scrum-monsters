/**
 * Basic instantiation test for SessionManager
 */

import { describe, it, expect } from 'vitest';
import { SessionManager } from './SessionManager';
import { ScopedEventBus } from '../events';

describe('SessionManager', () => {
  it('can be instantiated with EventBus dependency', () => {
    const eventBus = new ScopedEventBus();
    const sessionManager = new SessionManager({ eventBus });

    expect(sessionManager).toBeInstanceOf(SessionManager);
  });

  it('throws "Not implemented" for stub methods', () => {
    const eventBus = new ScopedEventBus();
    const sessionManager = new SessionManager({ eventBus });

    expect(() => sessionManager.createLobby('Host', 'TestLobby')).toThrow(
      'Not implemented'
    );
    expect(() => sessionManager.joinLobby('lobby-1', 'Player')).toThrow(
      'Not implemented'
    );
    expect(() => sessionManager.getLobby('lobby-1')).toThrow('Not implemented');
    expect(() => sessionManager.getPlayerLobby('player-1')).toThrow(
      'Not implemented'
    );
    expect(() => sessionManager.removePlayer('player-1')).toThrow(
      'Not implemented'
    );
    expect(() => sessionManager.recordPlayerActivity('player-1')).toThrow(
      'Not implemented'
    );
  });
});
