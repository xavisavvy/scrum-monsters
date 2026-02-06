/**
 * Agent-Friendly Error Examples
 * 
 * This file demonstrates common test error patterns and their fixes.
 * Use these patterns when writing new tests to avoid common pitfalls.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Example 1: EventBus Listener Return Type
// =============================================================================

describe('EventBus Listener Return Type Examples', () => {
  it('BAD: array.push() returns number, not void', () => {
    // ❌ This will cause TypeScript error: "Type 'number' is not assignable to type 'void'"
    // const events: string[] = [];
    // eventBus.on('test:event', () => events.push('data'));
    //                                  ^^^^^^^^^^^^^^^^^^^ returns number
    
    // Error message you'll see:
    // ⚠️  EventBus Listener Return Type Error
    // Expected: void | Promise<void>
    // Received: number
  });

  it('GOOD: wrap push() in block statement', () => {
    // ✅ Correct - wrapping in block makes it return void
    const events: string[] = [];
    const handler = () => { events.push('data'); };
    //                      ^^^^^^^^^^^^^^^^^^^^^^ returns void
    
    expect(handler()).toBeUndefined(); // Returns void
  });

  it('GOOD: use void operator as alternative', () => {
    // ✅ Alternative - explicit void return
    const events: string[] = [];
    const handler = () => void events.push('data');
    
    expect(handler()).toBeUndefined();
  });
});

// =============================================================================
// Example 2: Async/Await vs done() Callbacks
// =============================================================================

describe('Async Test Patterns (Vitest)', () => {
  it('BAD: Vitest does not support done() callbacks', () => {
    // ❌ This will cause TypeScript error
    // it('test', (done) => {
    //   setTimeout(() => {
    //     expect(true).toBe(true);
    //     done();
    //   }, 100);
    // });
    
    // Error: This expression is not callable. Type 'TestContext' has no call signatures.
  });

  it('GOOD: use async/await instead', async () => {
    // ✅ Correct Vitest pattern
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(true).toBe(true);
  });

  it('GOOD: return a Promise', () => {
    // ✅ Alternative - return Promise directly
    return new Promise(resolve => {
      setTimeout(() => {
        expect(true).toBe(true);
        resolve(undefined);
      }, 100);
    });
  });
});

// =============================================================================
// Example 3: Domain Manager Signature Errors
// =============================================================================

describe('Domain Manager API Patterns', () => {
  it('BAD: object destructuring instead of positional args', () => {
    // ❌ Common mistake - SessionManager uses positional args
    // const lobby = sessionManager.createLobby({
    //   hostName: 'Host1',
    //   lobbyName: 'Test Lobby'
    // });
    
    // Error: Expected 2-3 arguments, but got 1
    
    // This will show rich error with fix suggestion:
    // 🔍 Domain API Signature Mismatch
    // Expected: createLobby(hostName: string, lobbyName: string, options?: CreateLobbyOptions)
    // 
    // 💡 Common Fixes:
    // ❌ manager.createLobby({hostName, lobbyName})
    // ✅ manager.createLobby(hostName, lobbyName)
  });

  it('GOOD: use positional arguments', () => {
    // ✅ Correct - positional args as defined in signature
    // const lobby = sessionManager.createLobby('Host1', 'Test Lobby');
    expect(true).toBe(true);
  });
});

// =============================================================================
// Example 4: Import Path Errors
// =============================================================================

describe('Import Path Patterns', () => {
  it('BAD: incorrect import path', () => {
    // ❌ Wrong - trying to import from wrong location
    // import { SessionManager } from '@/server/domains/SessionManager';
    //                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    // Path alias '@' is for client/src, not server
    
    // Error: Cannot find module '@/server/domains/SessionManager'
  });

  it('GOOD: use correct path aliases', () => {
    // ✅ Correct path aliases:
    // import { SessionManager } from '../../../server/domains/SessionManager'; // Relative
    // import { GamePhase } from '@shared/gameEvents';  // @shared for shared/
    // import { Button } from '@/components/ui/button'; // @ for client/src/
    expect(true).toBe(true);
  });
});

// =============================================================================
// Example 5: Type Safety with EventBus
// =============================================================================

describe('EventBus Type Safety', () => {
  it('BAD: incorrect event payload type', () => {
    // ❌ TypeScript will catch this
    // eventBus.emit('estimation:vote_cast', {
    //   lobbyId: 'lobby1',
    //   playerId: 'player1',
    //   // Missing required fields: vote, team
    // });
    
    // Error: Argument of type '{ lobbyId: string; playerId: string; }' 
    //        is not assignable to parameter of type 'EstimationVoteCastPayload'
  });

  it('GOOD: use correct event payload types', () => {
    // ✅ Correct - all required fields present
    // eventBus.emit('estimation:vote_cast', {
    //   lobbyId: 'lobby1',
    //   playerId: 'player1',
    //   vote: 5,
    //   team: 'developers'
    // });
    
    // Types are defined in: server/events/eventTypes.ts
    expect(true).toBe(true);
  });
});

// =============================================================================
// Example 6: Test Organization
// =============================================================================

describe('Test Organization Best Practices', () => {
  it('should use descriptive test names', () => {
    // ✅ Good test names explain what behavior is being tested
    // Examples:
    // - "should award 10 XP when player casts a vote"
    // - "should emit battle_complete event when boss HP reaches 0"
    // - "should prevent voting after estimation is finalized"
    expect(true).toBe(true);
  });

  it('should group related tests with describe blocks', () => {
    // ✅ Use describe() to organize tests by feature/method
    // describe('SessionManager', () => {
    //   describe('createLobby', () => {
    //     it('creates lobby with unique ID', () => {});
    //     it('sets first player as host', () => {});
    //   });
    //   describe('joinLobby', () => {
    //     it('adds player to lobby', () => {});
    //   });
    // });
    expect(true).toBe(true);
  });
});

// =============================================================================
// Quick Reference: Common Patterns
// =============================================================================

/*
✅ DO:
- Use async/await for async tests
- Wrap array.push() in event listeners: () => { arr.push(x); }
- Use positional args for domain managers
- Import from correct paths (@shared, relative paths)
- Use describe() for grouping, it() for tests

❌ DON'T:
- Use done() callbacks (not supported in Vitest)
- Return values from event listeners
- Use object destructuring for positional arg functions
- Import server code with @ alias (that's for client only)
- Use test() instead of it() (inconsistent with codebase)

📚 Resources:
- TEST_MANIFEST.md - Complete test inventory
- CLAUDE.MD - Testing section for patterns
- client/src/test/setup.ts - Custom matchers and helpers
*/

export {};
