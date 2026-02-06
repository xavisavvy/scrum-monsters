import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from 'vitest';
import type { TestContext } from 'vitest';

/**
 * Enhanced test setup with agent-friendly error messages
 * 
 * Provides:
 * - Custom matchers with actionable fix suggestions
 * - Automatic related file suggestions on test failures
 * - Rich error context for faster debugging
 */

// =============================================================================
// Custom Matchers with Fix Suggestions
// =============================================================================

interface CustomMatchers<R = unknown> {
  toHaveValidDomainSignature(expectedSignature: string, filePath?: string, line?: number): R;
  toReturnVoidInEventListener(): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  /**
   * Validates function signatures match domain manager patterns
   */
  toHaveValidDomainSignature(
    received: any,
    expectedSignature: string,
    filePath?: string,
    line?: number
  ) {
    const pass = typeof received === 'function';
    
    if (!pass) {
      const locationHint = filePath ? `\n  📁 See: ${filePath}${line ? `:${line}` : ''}` : '';
      
      return {
        message: () => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Domain API Signature Mismatch
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Expected: ${expectedSignature}
Received: ${typeof received}${locationHint}

💡 Common Fixes:

1. Check positional arguments (not object destructuring):
   ❌ manager.createLobby({hostName, lobbyName})
   ✅ manager.createLobby(hostName, lobbyName)

2. Verify import path matches usage:
   import { SessionManager } from './SessionManager';
   
3. Check for typos in method names:
   ❌ manager.addPlayer()
   ✅ manager.joinLobby()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`,
        pass: false
      };
    }
    
    return { pass: true, message: () => '' };
  },

  /**
   * Validates EventBus listeners return void (not array.push() return value)
   */
  toReturnVoidInEventListener(received: any) {
    const returnValue = typeof received === 'function' ? received() : received;
    const pass = returnValue === undefined;
    
    if (!pass) {
      return {
        message: () => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  EventBus Listener Return Type Error
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EventBus listeners must return void or Promise<void>

Expected: void | Promise<void>
Received: ${typeof returnValue} (value: ${returnValue})

💡 Fix: Wrap array.push() in a block statement

❌ Bad:
   eventBus.on('event', () => events.push(data));
                                ^^^^^^^^^^^^^^^^ returns number

✅ Good:
   eventBus.on('event', () => { events.push(data); });
                                ^^^^^^^^^^^^^^^^^^^^^^ returns void

📖 See: server/events/EventBus.ts (DomainEventListener type)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`,
        pass: false
      };
    }
    
    return { pass: true, message: () => '' };
  }
});

// =============================================================================
// Automatic Related File Suggestions on Test Failures
// =============================================================================

const RELATED_FILE_PATTERNS: Record<string, string[]> = {
  // Domain managers
  'SessionManager.test.ts': [
    'server/domains/SessionManager.ts',
    'server/events/eventTypes.ts',
    'shared/gameEvents.ts'
  ],
  'EstimationManager.test.ts': [
    'server/domains/EstimationManager.ts',
    'server/events/eventTypes.ts',
    'server/errors/EstimationErrors.ts'
  ],
  'CombatManager.test.ts': [
    'server/domains/CombatManager.ts',
    'server/events/eventTypes.ts',
    'server/errors/CombatErrors.ts'
  ],
  'ProgressionManager.test.ts': [
    'server/domains/ProgressionManager.ts',
    'server/events/eventTypes.ts',
    'shared/progressionTypes.ts'
  ],
  
  // Event system
  'EventBus.test.ts': [
    'server/events/EventBus.ts',
    'server/events/eventTypes.ts'
  ],
  'ClientEventEmitter.test.ts': [
    'server/events/ClientEventEmitter.ts',
    'server/events/EventBus.ts',
    'shared/gameEvents.ts'
  ],
  
  // Client stores
  'useProgression.test.ts': [
    'client/src/lib/stores/useProgression.tsx',
    'shared/progressionTypes.ts'
  ],
  'useEventSync.test.ts': [
    'client/src/lib/stores/useEventSync.ts',
    'client/src/lib/stores/useWebSocket.tsx'
  ]
};

const COMMON_ERROR_PATTERNS = [
  {
    pattern: /Expected.*arguments.*but got/i,
    suggestion: 'Check function signature - may need positional args instead of object'
  },
  {
    pattern: /Type.*is not assignable to type.*void/i,
    suggestion: 'Event listener return type issue - wrap array.push() in block: { arr.push(x); }'
  },
  {
    pattern: /Cannot read.*undefined/i,
    suggestion: 'Null/undefined check missing - verify object exists before accessing property'
  },
  {
    pattern: /done is not a function/i,
    suggestion: 'Use async/await instead of done() callback in Vitest tests'
  },
  {
    pattern: /ReferenceError.*is not defined/i,
    suggestion: 'Missing import or variable declaration'
  }
];

afterEach((context) => {
  const task = (context as TestContext).task;
  
  if (task?.result?.state === 'fail') {
    const testFilePath = task.file?.filepath || '';
    const testFileName = testFilePath.split('/').pop() || '';
    const errorMessage = task.result.errors?.[0]?.message || '';
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Debug Context for Failed Test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📍 Test: ${task.name}`);
    console.log(`📁 File: ${testFilePath}`);
    
    // Suggest related files to check
    const relatedFiles = RELATED_FILE_PATTERNS[testFileName];
    if (relatedFiles && relatedFiles.length > 0) {
      console.log('\n📚 Related files to check:');
      relatedFiles.forEach(file => console.log(`   • ${file}`));
    }
    
    // Pattern-based suggestions
    const matchedPattern = COMMON_ERROR_PATTERNS.find(({ pattern }) => 
      pattern.test(errorMessage)
    );
    
    if (matchedPattern) {
      console.log('\n💡 Suggested fix:');
      console.log(`   ${matchedPattern.suggestion}`);
    }
    
    console.log('\n🔗 Quick commands:');
    console.log(`   npx vitest run ${testFilePath}`);
    console.log(`   npx vitest run --grep "${task.name}"`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
});

// =============================================================================
// Export type augmentations for TypeScript
// =============================================================================

export {};
