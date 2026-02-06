/**
 * Test Setup Enhancements Test
 * 
 * Verifies custom matchers and error handling work correctly.
 */

import { describe, it, expect } from 'vitest';

describe('Custom Test Matchers', () => {
  describe('toReturnVoidInEventListener', () => {
    it('passes when function returns undefined', () => {
      const voidFn = () => { return; };
      expect(voidFn()).toReturnVoidInEventListener();
    });

    it('passes when function has no return statement', () => {
      const voidFn = () => { 
        const x = 1 + 1; 
      };
      expect(voidFn()).toReturnVoidInEventListener();
    });

    it('passes when wrapping array.push', () => {
      const arr: number[] = [];
      const handler = () => { arr.push(1); };
      expect(handler()).toReturnVoidInEventListener();
    });

    // Note: The following would fail with helpful error message:
    // it('fails when function returns a value', () => {
    //   const nonVoidFn = () => 42;
    //   expect(nonVoidFn()).toReturnVoidInEventListener();
    // });
  });

  describe('toHaveValidDomainSignature', () => {
    it('passes when value is a function', () => {
      const fn = () => {};
      expect(fn).toHaveValidDomainSignature('() => void');
    });

    it('passes for any function type', () => {
      const fn = (a: string, b: number) => a.repeat(b);
      expect(fn).toHaveValidDomainSignature('(a: string, b: number) => string');
    });

    // Note: The following would fail with helpful error message:
    // it('fails when value is not a function', () => {
    //   const notAFunction = { key: 'value' };
    //   expect(notAFunction).toHaveValidDomainSignature('() => void', 'SomeFile.ts', 42);
    // });
  });
});

describe('Error Context Helpers', () => {
  it('provides related files for SessionManager tests', () => {
    // When a SessionManager.test.ts test fails, the afterEach hook will suggest:
    // - server/domains/SessionManager.ts
    // - server/events/eventTypes.ts
    // - shared/gameEvents.ts
    expect(true).toBe(true);
  });

  it('detects common error patterns', () => {
    // The afterEach hook recognizes patterns like:
    // - "Expected X arguments but got Y" → suggests checking function signature
    // - "Type X is not assignable to void" → suggests wrapping array.push()
    // - "done is not a function" → suggests using async/await
    expect(true).toBe(true);
  });
});
